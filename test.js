describe('Runtime basics', function() {
    
    it('should have webcrypto', async function(){
        expect(crypto.subtle).toBeDefined()
    })
})

describe('Registration and Login Functions', function() {
    beforeEach(async function () {
        api = await new MedBlocks()
        api.keyring.clear()
    })
    
    it('should generate keys', async function() {
        var key = await api.generateKey("testemail@test.com")
        expect(key.privateKeyArmored).toContain("-----BEGIN PGP PRIVATE")
    })

    
    it('should register user and login', async function() {
        var key = await api.register("test@test.com")
        api.login("test@test.com")
        expect(api.privateKey.armor()).toEqual(key.privateKeyArmored)
        // expect(api.privateKey.user)
    })

    it('should export key', async function(){
        await api.register("test@test.com")
        expect(await api.exportKey("test@test.com")).toContain("-----BEGIN PGP PRIVATE")
    })

    it('should logout user', async function(){
        var key = await api.register("test@test.com")
        api.login("test@test.com")
        expect(api.privateKey.armor()).toBeDefined()
        api.logout("test@test.com")
        expect(function(){console.log(api.privateKey.armor())}).toThrow()
        expect(api.email).toBeNull
    })
    afterEach( async function(){
        sessionStorage.clear()
        localStorage.clear()
        dbs = (await indexedDB.databases()).map(db=>db.name)
        for (var i; i<dbs.length; i++){
            indexedDB.deleteDatabase(dbs[i])}
    })
})

describe("Medblocks core: add, get, list", function(){
    beforeEach(async function(){
        api = await new MedBlocks()
        await api.keyring.clear()
        await api.register("testuser@test.com")
        await api.login("testuser@test.com")
    })

    it('should add string and get it back', async function(){
        hash = await api.add("Hello world!")
        result = await api.get(hash)
        expect(result).toEqual("Hello world!")
    }
    )
    it('should list added documents', async function() {
        doc1 = await api.add("Document1")
        doc2 = await api.add("Document2")
        list = await api.list("testuser@test.com")
        result = new Set([])
        for (var i=0; i<list.length; i++) {
            result.add(await api.get(list[i]))
        }
        expect(result).toEqual(new Set(["Document1","Document2"]))
    })
    
    afterEach(async function(){
        sessionStorage.clear()
        localStorage.clear()
        dbs = (await indexedDB.databases()).map(db=>db.name)
        for (var i; i<dbs.length; i++){
            indexedDB.deleteDatabase(dbs[i])}
    })
})

describe('Medblocks core: permit', function(){
    beforeEach(async function(){
        api = await new MedBlocks()
        await api.register("user1@test.com")
        await api.register("user2@test.com")
    })
    it('should block access to user without permission',async function(){
        await api.login("user1@test.com")
        documentHash = await api.add("Top secret document")
        api.login("user2@test.com")
        try {
            await api.get(documentHash)
        } catch (error) {
            errorMessage = error.message;
        }
        expect(errorMessage).toBe('No permission key found for user')
        
    })
    it('should allow access after permit', async function() {
        await api.login("user1@test.com")
        documentHash = await api.add("Top secret document")
        await api.permit(documentHash, "user2@test.com")
        api.login("user2@test.com")
        try {
            result = await api.get(documentHash)
        } catch (error) {
            errorMessage = error.message;
        }
        expect(result).toEqual("Top secret document")
    })
    afterEach(async function(){
        sessionStorage.clear()
        localStorage.clear()
        dbs = (await indexedDB.databases()).map(db=>db.name)
        for (var i; i<dbs.length; i++){
            indexedDB.deleteDatabase(dbs[i])}
    })
})