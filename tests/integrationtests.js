describe('Integtaion Tests', function() {
    beforeAll(async function initialize(){
        while (true){
            try {
                r = await fetch("http://app:8000/")
                json = await r.json()
                if (json.version == "Medblocks v1") {
                    console.log("Got Medblocks v1")
                    return
                }
                else {
                    throw new Error(`Did not get version Medblocks v1. Got ${JSON.stringify(json)}`)
                }
            }
            catch (error) {
                if (error.message == 'Failed to fetch'){
                    console.log("Waiting for medblocks services to start. Sleeping for 2 sec...")
                    await new Promise(resolve => setTimeout(resolve, 2000))
                }
                else {
                    throw error
                }
            }
        }
    }, 10000)

    describe("s3 integration tests", function() {
        afterEach(async function() {
            await clearStorage()
        })
        it('should sync localdb to s3', async ()=>{
            api = await new MedBlocks({
                sync: "api:8000",
                couch: "db:5984",
                s3: "s3:9000",
                replicate: true
            })
            keys = await api.register("tornadoalert@gmail.com")
            await api.login("tornadoalert@gmail.com")
            hash = await api.add("Testing string")
            await new Promise(resolve => setTimeout(resolve, 2000))
            r = await fetch(`http://${api.opts.s3}/blob/${hash}`)
            expect(r.status).toEqual(200)
            await clearStorage()
            api = await new MedBlocks({
                sync: "api:8000",
                couch: "db:5984",
                s3: "s3:9000",
                replicate: true
            })
            await api.importKey(keys.privateKeyArmored)
            await api.login("tornadoalert@gmail.com")
            message = await api.get(hash)
            expect(message).toEqual("Testing string")
            
        })
        it('should be able to handle spam', async ()=>{
            api = await new MedBlocks({
                sync: "api:8000",
                couch: "db:5984",
                s3: "s3:9000",
                replicate: true
            })
            keys = await api.register("tornadoalert@gmail.com")
            await api.login("tornadoalert@gmail.com")
            var hash
            for (var i=0; i<100; i++) {
                hash = await api.add("Testing string")
            }
            await new Promise(resolve => setTimeout(resolve, 1000))
            r = await fetch(`http://${api.opts.s3}/blob/${hash}`)
            expect(r.status).toEqual(200)
            
        }, 10000)
    })
})