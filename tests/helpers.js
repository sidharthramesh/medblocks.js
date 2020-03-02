async function clearStorage(){
    await window.sessionStorage.clear()
    await window.localStorage.clear()
    function deleteDatabase(name) {
        return new Promise(function (res, rej) {
            var req = indexedDB.deleteDatabase(name.name);
            req.onsuccess = function () {
                // console.log("Deleted database successfully");
                res();
            };
            req.onerror = function () {
                // console.log("Couldn't delete database");
                rej();
            };
            req.onblocked = function () {
                // console.log("Couldn't delete database due to the operation being blocked");
                rej();
            };
        })
    }

    await window.indexedDB.databases().then(a => {
        return Promise.all(a.map(b => deleteDatabase(b)));
    });
}

window.clearStorage = clearStorage