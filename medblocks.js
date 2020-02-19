class MedBlocks {
    constructor(medblocksUrl="localhost"){
        
        return (async () => {
            openpgp.config.commentstring = "medblocks.org"
            openpgp.config.versionstring = "Medblocks v1"
            this.medblocksUrl = medblocksUrl
            this.blob = new PouchDB("data")
            
            this._blob_replicator = this.blob.replicate.to(new PouchDB(
                `http://${this.medblocksUrl}:5984/data`), {live:true, retry:true}
                ).on('paused', function(err){
                    return err
                }).on('denied', function(err){
                    console.log("blobdatabase denied")
                    console.log(err)
                    // Make request to create db
                }).on('error', function(err){
                    console.log(err)
                })
            this.tx = new PouchDB("tx")
            this._tx_replicator = this.tx.replicate.to(new PouchDB(
                `http://${this.medblocksUrl}:5984/tx`), {live:true, retry:true}
                ).on('paused', function(err){
                    return err
                }).on('denied', function(err){
                    console.log("tx denied")
                    console.log(err)
                    // Make request to create db
                }).on('error', function(err){
                    console.log(err)
                })
            this.activity = new PouchDB("activity")
            this._activity_replicator = this.activity.replicate.to(new PouchDB(
                `http://${this.medblocksUrl}:5984/activity`), {live:true, retry:true}
                ).on('paused', function(err){
                    return err
                }).on('denied', function(err){
                    console.log("activity denied")
                    console.log(err)
                    // Make request to create db
                }).on('error', function(err){
                    console.log(err)
                })
            //catch errors to create new data db
            this.keyring = new openpgp.Keyring()
            await this.keyring.load();
            this.medblocksUrl = medblocksUrl
            return this; // when done
        })();
    }

    get privateKey() {
        if (!this.email) {
            throw new Error("User not logged in")
        }
        return this.keyring.privateKeys.getForAddress(this.email)[0]
    }

    get publicKey() {
        if (!this.email) {
            throw new Error("User not logged in")
        }
        return this.privateKey.toPublic()
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

    login(email){
        this.email = email
        this.activity.post({
            "type": "login",
            "email": email,
            "host": this.medblocksUrl,
            "publickey": this.publicKey.armor(),
            "time": new Date().getTime()
        })
    }

    logout() {
        this.email = undefined
    }

    async add(data) {
        //encrypt
        if (typeof data == "string") {
            var encodedData = openpgp.message.fromText(data)
        }
        if (typeof data == "object"){
            var encodedData = openpgp.message.fromBinary(data)
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
        this.blob.put(
            {
                "_id": hash,
                "_attachments": {
                    "file": {
                        content_type: 'text/plain',
                        data: new Blob(bytesArray)
                }
            }
            })
        
        // Add permission to db
        this.tx.put({
            "_id": openpgp.util.Uint8Array_to_hex(await openpgp.crypto.hash.sha256(openpgp.util.str_to_Uint8Array(accessKey))),
            "hash": hash,
            "type": "permission",
            "to": this.email,
            "key": accessKey
        })
    
        return hash
    }

    async list(email) {

        return
    }

    async get(hash) {

    }

    async permit(hash, to) {

    }

    

    
}
window.MedBlocks = MedBlocks