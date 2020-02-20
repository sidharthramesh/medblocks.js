class MedBlocks {
    constructor(medblocksUrl="localhost"){
        return (async () => {
            openpgp.config.commentstring = "medblocks.org"
            openpgp.config.versionstring = "Medblocks v1"
            this.medblocksUrl = medblocksUrl
            this.blob = new PouchDB("data")
            this.remoteBlob = new PouchDB(`http://${this.medblocksUrl}:5984/data`)
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
            this.tx = new PouchDB("tx")
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
            this.remoteTx = new PouchDB(`http://${this.medblocksUrl}:5984/tx`)
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
            await this.tx.createIndex({
                index: {
                    fields: ["hash","type","to"]
                }
            })
            this.activity = new PouchDB("activity")
            this.remoteActivity = new PouchDB(`http://${this.medblocksUrl}:5984/activity`)
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
            //catch errors to create new data db
            this.keyring = new openpgp.Keyring()
            await this.keyring.load();
            this.medblocksUrl = medblocksUrl
            return this; // when done
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

        this.activity.post(
            {
                "type": "register",
                "email": this.getEmailFromKey(privateKey),
                "host": this.medblocksUrl,
                "publickey": publicKey,
                "time": new Date().getTime()
            }
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
                to:"tornadoalert@gmail.com"
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
        var blob = await api.blob.getAttachment(hash, "file").catch(
            function(err) {
                if (err.status == 404) {
                    //Implement s3 object storage
                    throw "s3 search not yet implemented"
                }
            }
        )
        var type = blob.type
        var sessionKeyData = await openpgp.decrypt(
            {
                message: await openpgp.message.readArmored(accessKey),
                privateKeys: this.privateKey,
                format: "binary"
            }
        )
        var decoded = await openpgp.message.read(new Uint8Array(await blob.arrayBuffer()))
        if (type!=="text"){
            type = "binary"
        }
        var message = await openpgp.decrypt(
            {
                message: decoded,
                sessionKeys: {
                    data: sessionKeyData.data,
                    algorithm: 'aes256',
                },
                format: type
            }
        )
        return message.data
    }
    
    async list(email) {
        var selector = {
            selector:{
                to:"tornadoalert@gmail.com",
                type:"permission"
            }
        }
        var result = await this.remoteTx.find(selector)
        return result.docs.map((doc)=>doc.hash)
    }


    async permit(hash, to) {

    }

    

    
}
window.MedBlocks = MedBlocks