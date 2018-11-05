const SHA256 = require('crypto-js/sha256');
const level = require('level');
const chainDB = './chaindata';
const db = level(chainDB);
const Block = require('./Block.js');

//Method to fetch all data from LevelDB
function loadDataFromLevelDB () {
	return new Promise(function(resolve, reject){
		let dataArray = [];
		db.createReadStream()
		.on('data', function (data) {
			let modified = { key: parseInt(data.key), value: data.value }
		  dataArray.push(modified);
		})
		.on('error', function (err) {
		  reject(new Error(err));
		})
		.on('close', function () {
			let sortedArray = dataArray.sort(function (a, b){
				return a.key - b.key;
			});
		  resolve(sortedArray);
		});
	});
};

function addLevelDBData(key,value) {
  return new Promise(function(resolve, reject){
		db.put(key, value, function(err) {
	    if(err){
				reject('Block ' + key + ' submission failed' + err)
			}
			resolve(key)
	  });
	});
}

function getLevelDBData(key) {
	return new Promise(function(resolve, reject) {
		db.get(key, function(err, value) {
		  if(err)	{
				reject(err);
			}
			resolve(value);
		});
	});
}

function encodeToHex(string) {
	let result = "";
	for (let i=0; i < string.length; i++) {
		hex = string.charCodeAt(i).toString(16);
		result += ("000"+hex).slice(-4);
	}

	return result;
}

function decodeHexToString(string) {
	let result = "";
	let hexes = string.match(/.{1,4}/g) || [];
	for (let i=0; i < hexes.length; i++) {
		result += String.fromCharCode(parseInt(hexes[i], 16));
	}

	return result;
}

/* ===== Blockchain Class ==========================
|  Class with a constructor for new blockchain 		|
|  ================================================*/

module.exports = class Blockchain{
  constructor(){
	  this.chain = [];
		loadDataFromLevelDB().then((data) => {
			if(data.length === 0){
				let genesisStar = {
													  address: "20181105",
										        star: {
										                "ra": "16h 29m 1.0s",
										                "dec": "-26° 29' 24.9",
										                "story": "First block in the chain - Genesis block"
										              }
				                  }
	      this.addBlock(new Block(genesisStar));
			} else {
	      this.chain = data;
			}
		}).catch((error) => {
			console.error(error);
		});
  }

  // Add new block
  addBlock(newBlock){
		return new Promise((resolve, reject) => {
			loadDataFromLevelDB().then((data) => {
		    this.chain = data;
		    newBlock.height = this.chain.length;
				newBlock.body.star.story = encodeToHex(newBlock.body.star.story);
		    newBlock.time = new Date().getTime().toString().slice(0,-3);

		    if(this.chain.length>0){
					let blockInfo = JSON.parse(this.chain[this.chain.length-1].value);
		      newBlock.previousBlockHash = blockInfo.hash;
		    }

		    newBlock.hash = SHA256(JSON.stringify(newBlock)).toString();
		  	this.chain.push(newBlock);

				addLevelDBData(this.chain.length - 1, JSON.stringify(newBlock)).then((data) => {
					resolve(data)
				}).catch((error) => {
					reject(error);
				});
			}).catch((error) => {
				console.error(error);
			});
		});
  }

  async getBlockHeight(){
		try {
		  let data = await loadDataFromLevelDB()
		  this.chain = data;
      return this.chain.length-1;
		} catch(err) {
			console.error(err);
		}
  }

  getBlock(blockHeight){
		return new Promise((resolve, reject) => {
			getLevelDBData(blockHeight).then((data) => {
				let parsedData = JSON.parse(data);
				parsedData.body.star.storyDecoded = decodeHexToString(parsedData.body.star.story);
				resolve(parsedData);
			}).catch((err) => {
				reject(err);
			});
		});
  }

  getBlockWithAddress(address){
		return new Promise((resolve, reject) => {
			let result = [];
			loadDataFromLevelDB().then((data) => {
				for (let [index, value] of data.entries()) {
					let block = JSON.parse(value.value)
					if (block.body.address === address) {
				    block.body.star.storyDecoded = decodeHexToString(block.body.star.story);
						result.push(block);
					}
				}
				resolve(result);
			}).catch((err) => {
				reject(err);
			});
		});
  }

  getBlockWithHash(hash){
		return new Promise((resolve, reject) => {
			let result = [];
			loadDataFromLevelDB().then((data) => {
				for (let [index, value] of data.entries()) {
					let block = JSON.parse(value.value)
					if (block.hash === hash) {
				    block.body.star.storyDecoded = decodeHexToString(block.body.star.story);
						result.push(block);
					}
				}
				resolve(result);
			}).catch((err) => {
				reject(err);
			});
		});
  }

  validateBlock(blockHeight){
		return new Promise((resolve, reject) => {
	    this.getBlock(blockHeight).then((data) => {
	      // get block object
        let block = data
		    // get block hash
		    let blockHash = block.hash;
		    // remove block hash to test block integrity
		    block.hash = '';
		    // generate block hash
		    let validBlockHash = SHA256(JSON.stringify(block)).toString();
		    // Compare
		    if (blockHash===validBlockHash) {
	        return resolve(true);
		    } else {
	        console.log('Block #'+blockHeight+' invalid hash:\n'+blockHash+'<>'+validBlockHash);
	        return resolve(false);
		    }
			}).catch((error) => {
				reject(error);
			});
		});
  }

  async validateChain(){
    let errorLog = [];
    for (var i = 0; i < this.chain.length-1; i++) {
			let result = await this.validateBlock(i);

      if (!result) {
        errorLog.push(i);
			}

      let blockHash = this.chain[i].hash;
      let previousHash = this.chain[i+1].previousBlockHash;

      if (blockHash!==previousHash) {
        errorLog.push(i);
      }
    }

    if (errorLog.length>0) {
      console.log('Block errors = ' + errorLog.length);
      console.log('Blocks: '+errorLog);
    } else {
      console.log('No errors detected');
    }
  }
}
