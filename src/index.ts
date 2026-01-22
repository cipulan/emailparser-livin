import PostalMime from 'postal-mime';

interface Env {
	TELEGRAM_BOT_TOKEN: string;
	TELEGRAM_CHAT_ID: string;
}

export default {
	async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
		const telegramBotToken = env.TELEGRAM_BOT_TOKEN;
		const telegramChatId = env.TELEGRAM_CHAT_ID;

		if (!telegramBotToken || !telegramChatId) {
			console.error('Missing Telegram configuration');
			return;
		}

		try {
			const parser = new PostalMime();
			const email = await parser.parse(message.raw);

			// Check for forwarded content
			const forwarded = parseForwardedMail(email.text || email.html || '');

			// Use original details if available, otherwise fall back to current email headers
			const subject = forwarded.subject || email.subject || '(No Subject)';
			const from = forwarded.from || (email.from ? `${email.from.name} <${email.from.address}>` : '(Unknown Sender)');
			const date = forwarded.date ? forwarded.date : ''; // Only show date if it's from forwarded or we want to add current email date? User asked for date time value.

			// Extract transaction details if available
			const transactionDetails = parseTransactionDetails(email.html || email.text || '');

			let telegramMessage = `📧 *${from}*\n\n` +
				// `*From:* ${escapeMarkdown(from)}\n` +
				`*Subject:* ${escapeMarkdown(subject)}\n`;

			if (date) {
				telegramMessage += `*Date:* ${escapeMarkdown(date)}\n`;
			}

			telegramMessage += `\n` +
				`*Detail Transaksi:*\n` +
				`*Penerima:* ${escapeMarkdown(transactionDetails.penerima)}\n` +
				`*Nominal:* ${escapeMarkdown(transactionDetails.nominal)}\n` +
				`*No Ref:* ${escapeMarkdown(transactionDetails.noRef)}\n` +
				`*Sumber Dana:* ${escapeMarkdown(transactionDetails.sumberDana)}`;

			await sendToTelegram(telegramBotToken, telegramChatId, telegramMessage);

		} catch (error) {
			console.error('Error parsing email or sending to Telegram:', error);
			// Optional: send error notification to Telegram or log it
		}
	}
};

export function parseTransactionDetails(html: string): { penerima: string, nominal: string, noRef: string, sumberDana: string } {
	// Defaults
	let penerima = 'N/A';
	let nominal = 'N/A';
	let noRef = 'N/A';
	let sumberDana = 'N/A';

	if (!html) return { penerima, nominal, noRef, sumberDana };

	// Regex patterns based on the provided sample email structure
	// Penerima pattern: Looks for "Penerima" followed by an h4 tag content
	const penerimaMatch = html.match(/Penerima\s*<\/p>\s*<h4[^>]*>\s*(.*?)\s*<\/h4>/i);
	if (penerimaMatch && penerimaMatch[1]) {
		penerima = penerimaMatch[1].trim();
	}

	// Nominal pattern: Looks for "Nominal Transaksi" OR "Jumlah Transfer" cell followed by the value cell
	const nominalMatch = html.match(/(?:Nominal Transaksi|Jumlah Transfer)\s*<\/td>\s*<td[^>]*>\s*(.*?)\s*<\/td>/i);
	if (nominalMatch && nominalMatch[1]) {
		nominal = nominalMatch[1].trim();
	}

	// No. Referensi pattern: Looks for "No. Referensi" cell followed by the value cell
	const noRefMatch = html.match(/No\.\s*Referensi\s*<\/td>\s*<td[^>]*>\s*(.*?)\s*<\/td>/i);
	if (noRefMatch && noRefMatch[1]) {
		noRef = noRefMatch[1].trim();
	}

	// Sumber Dana pattern: Looks for "Sumber Dana" OR "Rekening Sumber" followed by an h4 tag content
	const sumberDanaMatch = html.match(/(?:Sumber Dana|Rekening Sumber)\s*<\/p>\s*<h4[^>]*>\s*(.*?)\s*<\/h4>/i);
	if (sumberDanaMatch && sumberDanaMatch[1]) {
		sumberDana = sumberDanaMatch[1].trim();
	}

	return { penerima, nominal, noRef, sumberDana };
}

function parseForwardedMail(content: string): { from?: string, subject?: string, date?: string } {
	let from, subject, date;

	// Regex for "From" / "Dari" in forwarded block
	// Matches "Dari: ... <...>" or "From: ... <...>"
	const fromMatch = content.match(/(?:Dari|From):\s*(.*?)(?:\r?\n|<br>)/i);
	if (fromMatch && fromMatch[1]) {
		from = fromMatch[1].trim();
		// Clean up HTML tags if present (simple check)
		from = from.replace(/<[^>]*>/g, '').trim();
	}

	// Regex for "Date" / "Tanggal"
	const dateMatch = content.match(/(?:Date|Tanggal|Sent):\s*(.*?)(?:\r?\n|<br>)/i);
	if (dateMatch && dateMatch[1]) {
		date = dateMatch[1].trim();
		date = date.replace(/<[^>]*>/g, '').trim();
	}

	// Regex for "Subject"
	const subjectMatch = content.match(/Subject:\s*(.*?)(?:\r?\n|<br>)/i);
	if (subjectMatch && subjectMatch[1]) {
		subject = subjectMatch[1].trim();
		subject = subject.replace(/<[^>]*>/g, '').trim();
	}

	return { from, subject, date };
}

async function sendToTelegram(token: string, chatId: string, text: string) {
	const url = `https://api.telegram.org/bot${token}/sendMessage`;
	const body = {
		chat_id: chatId,
		text: text,
		parse_mode: 'Markdown'
	};

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.error(`Telegram API error: ${response.status} ${response.statusText} - ${errorText}`);
	}
}

function escapeMarkdown(text: string): string {
	// Escape characters for MarkdownV2 if we used V2, but for standard Markdown in Telegram (v1 legacy) 
	// it's less strict. However, the user might simply use 'Markdown'.
	// 'Markdown' (v1) supports *bold*, _italic_, [text](url). 
	// It's safer to avoid conflicting markdown characters if we aren't strict.
	// For simplicity with 'Markdown' mode:
	return text.replace(/[_*`\[]/g, '\\$&');
}
