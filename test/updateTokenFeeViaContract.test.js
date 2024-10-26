const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TokenType, TokenSupplyType } = require("@hashgraph/sdk");

// Constants
const { OPERATOR_ID, OPERATOR_KEY_DER, OPERATOR_KEY_HEX, ALICE_KEY_HEX, BOB_KEY_HEX, NETWORKS } = require("../constants.js");

// Hedera SDK and SDK utilities
const { Client, AccountId, PrivateKey, Hbar } = require("@hashgraph/sdk");
const htsTokens = require("../utils/tokenOperations.js");

// ABIs
// For HTS operations
const IHederaTokenServiceABI_JSON = require("../hedera-smart-contracts/contracts-abi/contracts/system-contracts/hedera-token-service/IHederaTokenService.sol/IHederaTokenService.json");
const IHederaTokenServiceABI = new ethers.Interface(IHederaTokenServiceABI_JSON);
// For HBAR allowances via IHRC-632
const IHRC632ABI_JSON = require("../hedera-smart-contracts/contracts-abi/contracts/system-contracts/hedera-account-service/IHRC632.sol/IHRC632.json");
const IHRC632ABI = new ethers.Interface(IHRC632ABI_JSON);
// For HTS token allowances via ERC interfaces
const ERC20MockABI_JSON = require("../hedera-smart-contracts/contracts-abi/contracts/hip-583/ERC20Mock.sol/ERC20Mock.json");
const ERC20MockABI = new ethers.Interface(ERC20MockABI_JSON);
const ERC721MockABI_JSON = require("../hedera-smart-contracts/contracts-abi/contracts/hip-583/ERC721Mock.sol/ERC721Mock.json");
const ERC721MockABI = new ethers.Interface(ERC721MockABI_JSON);
// For HTS token associations via IHRC-719
const IHRC719ABI_JSON = require("../hedera-smart-contracts/contracts-abi/contracts/system-contracts/hedera-token-service/IHRC719.sol/IHRC719.json");
const IHRC719ABI = new ethers.Interface(IHRC719ABI_JSON);

describe("Update HTS token fees via contracts", function () {
	// Set up the network and signers
	const network = NETWORKS.testnet.name;
	const hashscanUrl = `https://hashscan.io/${network}/`;
	const treasurySigner = new ethers.Wallet(OPERATOR_KEY_HEX, ethers.provider);

	// Set up the Hedera SDK client (for HTS token creation)
	const treasuryId = AccountId.fromString(OPERATOR_ID);
	const treasuryKey = PrivateKey.fromStringDer(OPERATOR_KEY_DER);
	const client = Client.forNetwork(network).setOperator(treasuryId, treasuryKey);
	client.setDefaultMaxTransactionFee(new Hbar(50));
	client.setDefaultMaxQueryPayment(new Hbar(1));

	// Token setup
	let ftTokenId, ftTokenInfo, ftTokenAddress;
	let fixedFee, fractionalFee, royaltyFee;

	// HTS system contract address and gas limit
	const htsSystemContractAddress = "0x0000000000000000000000000000000000000167";
	const gasLimit = 1000000; // Set your desired gas limit

	before(async function () {
		console.log(`- Checking accounts and setting up HTS tokens for test cases...\n`);

		// Log the account addresses
		console.log(`- Treasury address: ${treasurySigner.address}`);

		// Generate keys to manage function aspects of the token
		const adminKey = PrivateKey.generateECDSA();
		const supplyKey = PrivateKey.generateECDSA();
		const pauseKey = PrivateKey.generateECDSA();
		const freezeKey = PrivateKey.generateECDSA();
		const wipeKey = PrivateKey.generateECDSA();
		const kycKey = PrivateKey.generateECDSA();
		const feeScheduleKey = treasuryKey;
		const metadataKey = PrivateKey.generateECDSA();
		const keys = [adminKey, supplyKey, pauseKey, freezeKey, wipeKey, kycKey, feeScheduleKey, metadataKey];

		// Fee schedules
		noFees = [];

		fixedFee = [
			{
				amount: 100000000, // Amount of fee: 1 HBAR
				tokenId: ethers.ZeroAddress, // Token ID of fee
				useHbarsForPayment: true, // Use HBAR for payment
				useCurrentTokenForPayment: false, // Use the token being transferred for payment
				feeCollector: treasurySigner.address, // Address of fee collector
			},
		];

		fractionalFee = [
			{
				numerator: 5, // Numerator of fee
				denominator: 100, // Denominator of fee
				minimumAmount: 1, // Minimum amount of fee (in token units)
				maximumAmount: 0, // Maximum amount of fee (0 implies no max)
				netOfTransfers: true, // Net of transfers
				feeCollector: treasurySigner.address, // Address of fee collector
			},
		];

		royaltyFee = [
			{
				numerator: 5, // Numerator of fee
				denominator: 100, // Denominator of fee
				// Fallback fee starts
				amount: 100000000, // Amount of fallback fee: 1 HBAR
				tokenId: ethers.ZeroAddress, // Token ID of fallback fee
				useHbarsForPayment: true, // Use HBAR for fallback fee payment
				// Fallback fee ends
				feeCollector: treasurySigner.address, // Address of fee collector
			},
		];

		// // Create Fungible Token
		// [ftTokenId, ftTokenInfo, txId] = await htsTokens.createHtsTokenFcn(
		// 	"HBAR ROCKS FT", // Token Name
		// 	"FT_HROCK", // Token Symbol
		// 	treasuryId, // Treasury Account ID
		// 	TokenType.FungibleCommon, // Token Type
		// 	TokenSupplyType.Finite, // Supply Type
		// 	1000, // Initial Supply
		// 	1000, // Max Supply
		// 	noFees, // Initial custom Fees
		// 	keys, // Keys array
		// 	treasuryKey, // Treasury Private Key
		// 	client // Client
		// );
		// ftTokenAddress = ftTokenId.toSolidityAddress();
		// ftTokenAddress = `0x${ftTokenAddress}`;
		ftTokenAddress = "0x00000000000000000000000000000000004ccebb";
		console.log(`\n- Fungible token ID: ${ftTokenId}`);
		console.log(`- Fungible token address: ${ftTokenAddress}`);
		console.log(`- See token details: \n${hashscanUrl}token/${ftTokenAddress}`);
		// console.log(`- See transaction details: \n${hashscanUrl}transaction/${txId}`);
	});

	it("Should update the custom fee for the fungible token", async function () {
		// Execute the fee schedule update
		const treasuryIHederaTokenService = await ethers.getContractAt(IHederaTokenServiceABI, htsSystemContractAddress, treasurySigner);

		const updateTokenFeesTx = await treasuryIHederaTokenService.updateFungibleTokenCustomFees(ftTokenAddress, fixedFee, fractionalFee, {
			gasLimit: gasLimit,
		});
		const updateTokenFeesRx = await updateTokenFeesTx.wait();
		const txHash = updateTokenFeesRx.hash;
		console.log(`\n- Transaction hash for token fees update: \n${txHash}`);
		console.log(`- See transaction details: \n${hashscanUrl}transaction/${txHash}`);

		// // TODO: Check the updated fees
		// const fungibleTokenInfoTx = await treasuryIHederaTokenService.getFungibleTokenInfo(ftTokenAddress);
		// const fungibleTokenInfoReceipt = await fungibleTokenInfoTx.wait();
		// const fungibleTokenInfo = fungibleTokenInfoReceipt.logs.filter((e) => e.fragment.name === Constants.Events.GetFungibleTokenInfo)[0].args[0];

		// expect(fungibleTokenInfo.tokenInfo.token.name).to.equal(Constants.TOKEN_NAME);
		// expect(fungibleTokenInfo.tokenInfo.token.symbol).to.equal(Constants.TOKEN_SYMBOL);
		// expect(fungibleTokenInfo.tokenInfo.totalSupply).to.equal(200);
		// expect(fungibleTokenInfo.decimals).to.equal(8);
	});
});
