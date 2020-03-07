describe('Runtime basics', function() {
    
    it('should have webcrypto', async function(){
        expect(crypto.subtle).toBeDefined()
    })
})

describe('Registration and Login Functions', function() {

    beforeEach(async function () {
        api = await new MedBlocks()
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
    afterEach(async function(){
        await clearStorage();
    })
})

describe("Medblocks core: add, get, list", function(){

    beforeEach(async function(){
        api = await new MedBlocks()
        await api.register("testuser@test.com")
        await api.login("testuser@test.com")
    })

    it('should add string and get it back', async function(){
        hash = await api.add("Hello world!", "test")
        result = await api.get(hash)
        expect(result).toEqual("Hello world!")
    }
    )
    it('should list added documents', async function() {
        doc1 = await api.add("Document1", "test")
        doc2 = await api.add("Document2", "test")
        list = await api.list("testuser@test.com")
        result = new Set([])
        for (var i=0; i<list.length; i++) {
            result.add(await api.get(list[i]))
        }
        expect(result).toEqual(new Set(["Document1","Document2"]))
    })
    
    afterEach(async function(){
        await clearStorage()
    })
})

describe('Medblocks core: permit', function(){
    beforeEach(async function(){sessionStorage.clear()
        api = await new MedBlocks()
        await api.register("user1@test.com")
        await api.register("user2@test.com")
    })
    it('should block access to user without permission',async function(){
        await api.login("user1@test.com")
        documentHash = await api.add("Top secret document", "test")
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
        documentHash = await api.add("Top secret document", "test")
        await api.permit(documentHash, "user2@test.com")
        api.login("user2@test.com")
        try {
            result = await api.get(documentHash)
        } catch (error) {
            errorMessage = error.message;
        }
        expect(result).toEqual("Top secret document")
    })
    it('should list by tag', async function(){
        await api.login("user1@test.com")
        hash1 = await api.add("Hello there", "test1")
        hash2 = await api.add("Nice to see you here", "test1")
        hash3 = await api.add("This should not show up", "test2")
        expected_set = new Set([hash1, hash2])
        result_set = new Set(await api.list("user1@test.com", "test1"))
        expect(result_set).toEqual(expected_set)
        
    })
    afterEach(async function(){
        await clearStorage()
    })
})