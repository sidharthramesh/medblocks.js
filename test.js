
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
        key = await api.generateKey("testemail@test.com")
        expect(key).toContain("-----BEGIN PGP PRIVATE")
    })

    
    it('should register user and login', async function() {
        var key = await api.register("test@test.com")
        api.login("test@test.com")
        expect(api.privateKey.armor()).toEqual(key)
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
    afterEach(function(){
        sessionStorage.clear()
        localStorage.clear()
        indexedDB.deleteDatabase("_pouch_tx")
        indexedDB.deleteDatabase("_pouch_data")
        indexedDB.deleteDatabase("_pouch_activity")
    })
})

describe("Add and get functions", function(){
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
    afterEach(function() {
        sessionStorage.clear()
        localStorage.clear()
        indexedDB.deleteDatabase("_pouch_tx")
        indexedDB.deleteDatabase("_pouch_data")
        indexedDB.deleteDatabase("_pouch_activity")
    })
})