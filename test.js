
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
})