class MedBlocks {
    constructor(medblocksUrl="localhost"){
        
        return (async () => {
            openpgp.config.commentstring = "medblocks.org"
            openpgp.config.versionstring = "Medblocks v1"
            this.medblocksUrl = medblocksUrl
            this.blobdb = new PouchDB("data")
            this._blobrephandler = this.blobdb.replicate.to(new PouchDB(`http://${this.medblocksUrl}:5984/data`), {live:true, retry:true})
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
        return {
            privateKey : privateKeyArmored,
            revocationCertificate: revocationCertificate
        }
    }
    async exportKey(email){
        return this.keyring.privateKeys.getForAddress(email)[0].armor()
    }

    async importKey(privateKey) {
        var publicKey = (await openpgp.key.readArmored(privateKey)).keys[0].toPublic().armor()
        await this.keyring.privateKeys.importKey(privateKey)
        await this.keyring.publicKeys.importKey(publicKey)
        await this.keyring.store()
    }
    async register(email){
        var keys = await this.generateKey(email)
        //TODO Send revocation cert somewhere safe if key is lost
        await this.importKey(keys.privateKey)
        // var hkp = new openpgp.HKP('https://pgp.mit.edu'); // Change to medblocks server later
        // await hkp.upload(keys.publicKey);
        return keys
    }

    login(email){
        this.email = email
        this.db = new PouchDB("hex"+openpgp.util.str_to_hex(email))
        this._dbreplicationhandler = this.db.replicate.to(new PouchDB(`http://${this.medblocksUrl}:5984/${this.db.name}`), {live:true, retry:true})
        //Catch error when cannot create db
        //Send request to create new remote DB
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

        //Add file to blobdb
        this.blobdb.put(
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
        this.db.put({
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