import PouchDB from 'pouchdb';
import PouchDBFind from 'pouchdb-find';
import * as openpgp from 'openpgp';
PouchDB.plugin(PouchDBFind);

class MedBlocks {
    constructor(opts){
        if (typeof opts == 'string') opts = {
            sync: `${opts}:8000`,
            s3: `${opts}:9000`,
            couch: `${opts}:5984`,
            replicate: true
        }
        if (typeof opts !== 'object') opts = {}
        var defaults = {
            sync: "localhost",
            s3: "localhost",
            couch:"localhost",
            replicate: false
        }
        opts = Object.assign({}, defaults, opts)
        this.opts = opts
        openpgp.config.commentstring = "medblocks.org"
        openpgp.config.versionstring = "Medblocks v1"
        
        return (async () => {
            this.medblocksUrl = opts.medblocksUrl
            // Initialize Keyring
            this.keyring = new openpgp.Keyring()
            await this.keyring.load()
            // Create local PouchDB database objects 
            this.blob = new PouchDB("data")
            this.tx = new PouchDB("tx")
            this.activity = new PouchDB("activity")
            // Create remote database objects
            if (opts.replicate){
                this.remoteBlob = new PouchDB(`http://${this.opts.couch}/data`, {skip_setup: true})
                this.remoteTx = new PouchDB(`http://${this.opts.couch}/tx`, {skip_setup: true})
                this.remoteActivity = new PouchDB(`http://${this.opts.couch}/activity`, {skip_setup: true})
            }
            
            //Create indexes for faster query locally
            await Promise.all([
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
                ),
                this.tx.createIndex(
                    {
                        index:{
                            fields: [
                                "to",
                                "type",
                                "tag"
                            ],
                            name: "toTypeTagIndex",
                            ddoc: "toTypeTagIndex"
                        },
                    }
                ),
                this.activity.createIndex(
                    {
                        index: {
                            fields: [
                                "email",
                                "type",
                                "time"
                            ]
                        },
                        name: "emailTypeTime",
                        ddoc: "emailTypeTime"
                    }
                )
            ])
            // Set up remote replications
            if (opts.replicate){
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
        // If multiple privatekeys found, raise Error
        var keys = this.keyring.privateKeys.getForAddress(this.user)
        if (keys.length>1) {
            console.warn("Found multiple private keys for user. Falling back to first in keyring")
        }
        return keys[0]
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
        return {privateKeyArmored:privateKeyArmored, revocationCertificate:revocationCertificate}
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
        // Check for existing register data and throw warning about revocation certificate
        var data = {
            "type": "register",
            "email": await this.getEmailFromKey(privateKey),
            "host": this.opts.sync,
            "publickey": publicKey,
            "time": new Date().getTime()
        }
        this.activity.post(
            data
        )
        return privateKey
    }

    async revoke(email, revocationCertificate){
        var data = {
            "type": "revoke",
            "email": email,
            "host": this.opts.sync,
            "certificate": revocationCertificate,
            "time": new Date().getTime()
        }
        r = await this.activity.post(
            data
        )
        return r
    }

    async register(email){
        var {privateKeyArmored, revocationCertificate} = await this.generateKey(email)
        privateKeyArmored = await this.registerPrivateKey(privateKeyArmored)
        return {privateKeyArmored:privateKeyArmored, revocationCertificate: revocationCertificate}
    }

    async login(email){
        this.email = email
        var activityData = {
            "type": "login",
            "email": email,
            "host": this.opts.sync,
            "publickey": this.publicKey.armor(),
            "time": new Date().getTime()
        }
        activityData["_id"] = await this.calculateStringHash(JSON.stringify(activityData))
        this.activity.put(activityData)
    }

    async logout() {
        this.email = undefined
    }

    async encryptSessionKey(sessionKey, publicKey) {
        var accessKey = await openpgp.encrypt({
            message: openpgp.message.fromBinary(sessionKey),
            publicKeys: [publicKey],
            privateKeys: [this.privateKey]
        })
        return accessKey
    }
    async add(data, tag) {
        if (!data) {
            throw new Error("Add requires data")
        }
        if (!tag) {
            throw new Error("Add requires tag")
        }
        var email = this.user
        //encrypt
        var encodedData = openpgp.message.fromText(data)

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
        
        var accessKey = await this.encryptSessionKey(aes_key, this.publicKey)

        //Add file to blob
        var dataView = new DataView(bytesArray.buffer)
        var blob = new Blob([dataView],{type: "application/medblocks"})
        await this.blob.put(
            {
                "_id": hash,
                "_attachments": {
                    "file": {
                        content_type: "application/medblocks",
                        data: blob
                }
            }
            })
        
        // Add permission to db
        await this.tx.put({
            "_id": await this.calculateStringHash(accessKey.data),
            "hash": hash,
            "type": "permission",
            "to": email,
            "key": accessKey.data,
            "tag": tag
        })
    
        return hash
    }
    async getAccessKey(hash) {
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
            if (this.remoteTx){
                result = await this.remoteTx.find(selector)
            }
            if (result.docs.length == 0) {
                throw new Error("No permission key found for user")
            }
        }
        return result.docs[0]["key"]
    }
    async getTag(hash) {
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
            if (this.remoteTx){
                result = await this.remoteTx.find(selector)
            }
            if (result.docs.length == 0) {
                throw new Error("No permission key found for user")
            }
        }
        return result.docs[0]["tag"]
    }
    async getBlob(hash){
        var bytes = await this.blob.getAttachment(hash, "file")
        .then(
            async blob=>new Uint8Array(await blob.arrayBuffer())
        )
        .catch(
            (err) => {
                if (err.status == 404) {
                    //Implement s3 object storage
                    var url = `http://${this.opts.s3}/blob/${hash}`
                    return fetch(url).then(r=>r.body).then(stream=>stream.getReader().read()).then(read=>read.value)
                }
                else {
                    throw err
                }
            }
        )
        return bytes
    }
    async decryptAccessKey(accessKey){
        var sessionKeyData = await openpgp.decrypt(
            {
                message: await openpgp.message.readArmored(accessKey),
                privateKeys: this.privateKey,
                format: "binary"
            }
        )
        return sessionKeyData.data
            
    }
    async get(hash) {
        // Try local database
        var accessKey = await this.getAccessKey(hash)
        var bytes = await this.getBlob(hash)
        var sessionKey = await this.decryptAccessKey(accessKey)
        // Figure out format and type
        var message = await openpgp.decrypt(
            {
                message: await openpgp.message.read(bytes),
                sessionKeys: {
                    data: sessionKey,
                    algorithm: 'aes256',
                },
                format: "text"
            }
        )
        return message.data
    }
    
    async list(email, tag) {
        var selector
        if (!tag) {
            selector = {
                selector:{
                    to:email,
                    type:"permission",
                }
            } 
        }
        else {
            selector = {
                selector:{
                    to:email,
                    type:"permission",
                    tag: tag
                }
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
        var accessKey = await this.getAccessKey(hash)
        var sessionKey = await this.decryptAccessKey(accessKey)
        
        //TODO Search for public key from email
        // Search for revocation certificates on same email
        var selector = {
            selector:{
                email:to,
                type:"register"
            }
        }
        if (this.remoteActivity) {
            var result = await this.remoteActivity.find(selector)
        }
        else {
            var result = await this.activity.find(selector)
        }
        var publicKeys = result.docs.map(doc=>doc["publickey"])
        if (publicKeys.length > 1){
            console.warn("Multiple public keys found for email. Falling back to earliest non-revoked key")
        }
        // Revoked key logic here
        var publicKey = publicKeys[0]
        publicKey = (await openpgp.key.readArmored(publicKey)).keys[0]
        var encryptedKey = await this.encryptSessionKey(sessionKey, publicKey)
        var id = await this.calculateStringHash(encryptedKey.data)
        var tag = await this.getTag(hash)
        await this.tx.put({
            "_id": id,
            "hash": hash,
            "type": "permission",
            "to": to,
            "key": encryptedKey.data,
            "tag": tag
        })
        return id
    }
}

export default MedBlocks