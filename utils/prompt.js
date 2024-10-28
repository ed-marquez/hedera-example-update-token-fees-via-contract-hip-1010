const readline = require("readline");

const waitForInput = async (message = "\nPress Enter to update the token fees...") => {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	await new Promise((resolve) =>
		rl.question(message, () => {
			rl.close();
			resolve();
		})
	);
};

module.exports = { waitForInput };
