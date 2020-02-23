class MedBlocks {
    constructor(medblocksUrl="localhost", replicate=false){
        return (async () => {
            openpgp.config.commentstring = "medblocks.org"
            openpgp.config.versionstring = "Medblocks v1"
            this.medblocksUrl = medblocksUrl
            // Initialize Keyring
            this.keyring = new openpgp.Keyring()
            await this.keyring.load();
            // Create local PouchDB database objects 
            this.blob = new PouchDB("data")
            this.tx = new PouchDB("tx")
            this.activity = new PouchDB("activity")
            // Create remote database objects
            if (replicate){
                this.remoteBlob = new PouchDB(`http://${this.medblocksUrl}:5984/data`)
                this.remoteTx = new PouchDB(`http://${this.medblocksUrl}:5984/tx`)
                this.remoteActivity = new PouchDB(`http://${this.medblocksUrl}:5984/activity`)
            }
            
            //Create indexes for faster query locally
            this.tx.createIndex(
                {
                    index:{
                        fields: [
                            "hash",
                            "type",
                            "to"
                        ],
                        name: "hashTypeToIndex",
                        ddoc: "hashTypeToIndex"
                    },
                }
            )
            this.tx.createIndex(
                {
                    index:{
                        fields: [
                            "to",
                            "type"
                        ],
                        name: "toTypeIndex",
                        ddoc: "toTypeIndex"
                    },
                }
            )
            
            this.tx.createIndex({
                index: {
                    fields: ["hash","type","to"]
                }
            })
            // Set up remote replications
            if (replicate){
                this._tx_replicator = this.tx.replicate.to(this.remoteTx, {live:true, retry:true}
                    ).on('paused', function(err){
                        return err
                    }).on('denied', function(err){
                        console.log("tx denied")
                        console.log(err)
                        // Make request to create db
                    }).on('error', function(err){
                        console.log('replication error')
                    })
                this._activity_replicator = this.activity.replicate.to(this.remoteActivity, {live:true, retry:true}
                    ).on('paused', function(err){
                        return err
                    }).on('denied', function(err){
                        console.log("activity denied")
                        console.log(err)
                        // Make request to create db
                    }).on('error', function(err){
                        console.log('replication error')
                    })
                this._blob_replicator = this.blob.replicate.to(this.remoteBlob, {live:true, retry:true}
                    ).on('paused', function(err){
                        return err
                    }).on('denied', function(err){  
                        console.log("blobdatabase denied")
                        console.log(err)
                        // Make request to create db
                    }).on('error', function(err){
                        console.log('replication error')
                    })
            }
            return this
        })();
    }

    async calculateStringHash(string){
        return await openpgp.util.Uint8Array_to_hex(await openpgp.crypto.hash.sha256(openpgp.util.str_to_Uint8Array(string)))
    }

    get privateKey() {
        return this.keyring.privateKeys.getForAddress(this.user)[0]
    }

    get publicKey() {
        return this.privateKey.toPublic()
    }
    get user(){
        if (!this.email) {
            throw new Error("User must be logged in")
        }
        return this.email
    }

    async generateKey(email){
        if (!email) {
            throw "Email is required"
        }
        const {privateKeyArmored, publicKeyArmored, revocationCertificate} = await openpgp.generateKey(
            {
                userIds: [{"email":email}], 
                curve: 'ed25519'
            }
        )
        return privateKeyArmored
    }

    async exportKey(email){
        return this.keyring.privateKeys.getForAddress(email)[0].armor()
    }

    async importKey(privateKey) {
        var publicKey = (await openpgp.key.readArmored(privateKey)).keys[0].toPublic().armor()
        await this.keyring.privateKeys.importKey(privateKey)
        await this.keyring.publicKeys.importKey(publicKey)
        await this.keyring.store()
        return publicKey
    }

    async getEmailFromKey(key){
        return (await openpgp.key.readArmored(key)).keys[0].users[0].userId.email
    }

    async registerPrivateKey(privateKey){
        var publicKey = await this.importKey(privateKey)
        var data = {
            "type": "register",
            "email": await this.getEmailFromKey(privateKey),
            "host": this.medblocksUrl,
            "publickey": publicKey,
            "time": new Date().getTime()
        }
        this.activity.post(
            data
        )
        return privateKey
    }

    async register(email){
        var privateKey = await this.generateKey(email)
        privateKey = await this.registerPrivateKey(privateKey)
        return privateKey
    }

    async login(email){
        this.email = email
        var activityData = {
            "type": "login",
            "email": email,
            "host": this.medblocksUrl,
            "publickey": this.publicKey.armor(),
            "time": new Date().getTime()
        }
        activityData["_id"] = await this.calculateStringHash(JSON.stringify(activityData))
        this.activity.put(activityData)
    }

    async logout() {
        this.email = undefined
    }

    async add(data, type) {
        var email = this.user
        //encrypt
        var autotype
        if (typeof data == "string") {
            var encodedData = openpgp.message.fromText(data)
            autotype = "text"
        }
        if (typeof data == "object"){
            var encodedData = openpgp.message.fromBinary(data)
            autotype = "binary"
        }
        if (!type) {
            type = autotype
        }
        
        var aes_key = await openpgp.crypto.generateSessionKey('aes256')
        var encObj = {
            message: encodedData,
            sessionKey : {
                data: aes_key,
                algorithm: 'aes256',
                },
            armor: false
        }
        
        var encrypted = await openpgp.encrypt(encObj)
        var bytesArray = encrypted.message.packets.write()
        var hash = openpgp.util.Uint8Array_to_hex(await openpgp.crypto.hash.sha256(bytesArray))
        
        var accessKey = await openpgp.encrypt({
            message: openpgp.message.fromBinary(aes_key),
            publicKeys: [this.publicKey],
            privateKeys: [this.privateKey]
        })

        //Add file to blob
        var dataView = new DataView(bytesArray.buffer)
        var blob = new Blob([dataView],{type: type})
        this.blob.put(
            {
                "_id": hash,
                "_attachments": {
                    "file": {
                        content_type: type,
                        data: blob
                }
            }
            })
        
        // Add permission to db
        this.tx.put({
            "_id": await this.calculateStringHash(accessKey.data),
            "hash": hash,
            "type": "permission",
            "to": email,
            "key": accessKey.data
        })
    
        return hash
    }

    async get(hash) {
        // Try local database
        
        var selector = {
            selector:{
                hash:hash, 
                type:"permission",
                to:this.user
            }
        }
        var result = await this.tx.find(selector)
        if (result.docs.length == 0){
            //Search remote db
            result = await this.remoteTx.find(selector)
            if (result.docs.length == 0) {
                throw new Error("No permission key found for user")
            }
        }
        var accessKey = result.docs[0]["key"]
        var bytes = await api.blob.getAttachment(hash, "file")
        .then(
            async blob=>new Uint8Array(await blob.arrayBuffer())
        )
        .catch(
            (err) => {
                if (err.status == 404) {
                    //Implement s3 object storage
                    var url = `http://${this.medblocksUrl}:9000/blob/${hash}`
                    return fetch(url).then(r=>r.body).then(stream=>stream.getReader().read()).then(read=>read.value)
                }
                else {
                    throw err
                }
            }
        )
        var sessionKeyData = await openpgp.decrypt(
            {
                message: await openpgp.message.readArmored(accessKey),
                privateKeys: this.privateKey,
                format: "binary"
            }
        )
        // Figure out format and type
        var message = await openpgp.decrypt(
            {
                message: await openpgp.message.read(bytes),
                sessionKeys: {
                    data: sessionKeyData.data,
                    algorithm: 'aes256',
                },
                format: "text"
            }
        )
        return message.data
    }
    
    async list(email) {
        var selector = {
            selector:{
                to:email,
                type:"permission"
            }
        }
        if (this.remoteTx){
            var result = await this.remoteTx.find(selector)
        }
        else {
            var result = await this.tx.find(selector)
        }
        return result.docs.map((doc)=>doc.hash)
    }


    async permit(hash, to) {

    }

    

    
}
window.MedBlocks = MedBlocks