![MedBlocks Logo](https://i.imgur.com/Dx4LfC2.png)

With Medblocks you can store your medical records (and other documents actually) securely on a peer to peer database. The blob database is compatible with the S3 api and can be 

## Installation
The installation requires docker and docker-compose.

Clone the repository
```
git clone https://github.com/sidharthramesh/medblocks.js.git
cd medblocks.js

```
Install packages
```
npm install
```
## Test

Integration tests against medblocks.py
Clone https://github.com/sidharthramesh/medblocks.git to folder outside the medblocks.js directory `../mb.py `
```
make
```