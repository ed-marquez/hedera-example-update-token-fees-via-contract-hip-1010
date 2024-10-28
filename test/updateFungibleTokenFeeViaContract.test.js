// Clear the console
console.clear();
// Chai and ethers
const { expect } = require("chai");
const { ethers } = require("hardhat");
// Hedera SDK, utilities, and constants
const { Client, AccountId, PrivateKey, Hbar, TokenType, TokenSupplyType } = require("@hashgraph/sdk");
const htsTokens = require("../utils/tokenOperations.js");
const { OPERATOR_ID, OPERATOR_KEY_HEX, NETWORKS } = require("../constants.js");
const { waitForInput } = require("../utils/prompt.js");
// ABIs
const { IHederaTokenServiceABI } = require("../utils/contractInterfaces.js");

describe("🟠 Update Custom Fees for HTS Fungible Tokens Via Smart Contracts 🟠", function () {
	// Set up the network, explorer URL, and Hedera SDK client (for HTS token creation)
	const network = NETWORKS.testnet.name;
	const hashscanUrl = `https://hashscan.io/${network}/`;
	const treasuryId = AccountId.fromString(OPERATOR_ID);
	const treasuryKey = PrivateKey.fromStringECDSA(OPERATOR_KEY_HEX);
	const client = Client.forNetwork(network).setOperator(treasuryId, treasuryKey);
	client.setDefaultMaxTransactionFee(new Hbar(50));
	client.setDefaultMaxQueryPayment(new Hbar(1));

	// Set up the network and ethers signer
	const treasurySigner = new ethers.Wallet(OPERATOR_KEY_HEX, ethers.provider);

	// Token setup
	let ftTokenId, ftTokenAddress;
	let fixedFee, fractionalFee, royaltyFee;

	// HTS system contract address and gas limit
	const htsSystemContractAddress = "0x0000000000000000000000000000000000000167";
	const gasLimit = 1000000; // Set your desired gas limit

	before(async function () {
		console.log(`\n- Checking accounts and setting up HTS tokens for test cases...`);
		console.log(`- Treasury address: ${treasurySigner.address}`);

		console.log(`\n- Creating keys for token management and fee schedules...`);
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

		// Fee schedules: Fungible tokens can only have fixed and fractional fees (no royalty fees)
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

		// Create Fungible Token
		console.log(`- Creating HTS fungible token...`);
		[ftTokenId, tokenInfo, txId] = await htsTokens.createHtsTokenFcn(
			"HBAR ROCKS FT", // Token Name
			"FT_HROCK", // Token Symbol
			treasuryId, // Treasury Account ID
			TokenType.FungibleCommon, // Token Type
			TokenSupplyType.Finite, // Supply Type
			1000, // Initial Supply
			1000, // Max Supply
			[], // No initial custom Fees
			keys, // Keys array
			treasuryKey, // Treasury Private Key
			client // Client
		);
		ftTokenAddress = ftTokenId.toSolidityAddress();
		ftTokenAddress = `0x${ftTokenAddress}`;
		console.log(`- Fungible token ID: ${ftTokenId}`);
		console.log(`- Fungible token address: ${ftTokenAddress}`);
		console.log(`- See transaction details: \n${hashscanUrl}transaction/${txId}`);

		console.log(`\n🛑 Check in HashScan that the token has no initial custom fees 🔗👇: \n${hashscanUrl}token/${ftTokenAddress}`);
		await waitForInput();
	});

	it("Should update the custom fee for the fungible token", async function () {
		// Execute the fee schedule update
		const treasuryIHederaTokenService = await ethers.getContractAt(IHederaTokenServiceABI, htsSystemContractAddress, treasurySigner);

		console.log(`\n- Updating token fees...`);
		const updateTokenFeesTx = await treasuryIHederaTokenService.updateFungibleTokenCustomFees(ftTokenAddress, fixedFee, fractionalFee, {
			gasLimit: gasLimit,
		});
		const updateTokenFeesRx = await updateTokenFeesTx.wait();
		const txHash = updateTokenFeesRx.hash;
		console.log(`- Transaction hash for token fees update: \n${txHash}`);
		console.log(`- See transaction details: \n${hashscanUrl}transaction/${txHash}`);

		console.log(`\n🔄 Refresh the token details page in HashScan to see the new fees: \n${hashscanUrl}token/${ftTokenAddress}`);

		console.log(`\n- THE END ============================================================\n`);
		console.log(`👇 Go to:`);
		console.log(`🔗 www.hedera.com/discord\n`);

		expect(updateTokenFeesTx.hash).to.exist;
		expect(updateTokenFeesRx.status).to.equal(1);
	});
});
