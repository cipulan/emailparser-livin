import PostalMime from 'postal-mime';
import * as fs from 'fs';
import * as path from 'path';
import { parseTransactionDetails } from '../src/index';

// Only for testing/mocking the internal function since it's not exported
function parseForwardedMail(content: string): { from?: string, subject?: string, date?: string } {
    let from, subject, date;
    const fromMatch = content.match(/(?:Dari|From):\s*(.*?)(?:\r?\n|<br>)/i);
    if (fromMatch && fromMatch[1]) from = fromMatch[1].trim().replace(/<[^>]*>/g, '').trim();
    const dateMatch = content.match(/(?:Date|Tanggal|Sent):\s*(.*?)(?:\r?\n|<br>)/i);
    if (dateMatch && dateMatch[1]) date = dateMatch[1].trim().replace(/<[^>]*>/g, '').trim();
    const subjectMatch = content.match(/Subject:\s*(.*?)(?:\r?\n|<br>)/i);
    if (subjectMatch && subjectMatch[1]) subject = subjectMatch[1].trim().replace(/<[^>]*>/g, '').trim();
    return { from, subject, date };
}

async function test() {
    // Test with the Forwarded email
    const emlPath = path.join(process.cwd(), 'Fwd_ Pembayaran Berhasil!.eml');

    if (!fs.existsSync(emlPath)) {
        console.error(`Error: Could not find email file at ${emlPath}`);
        process.exit(1);
    }

    console.log(`Reading email from: ${emlPath}`);
    const emlContent = fs.readFileSync(emlPath);

    const parser = new PostalMime();
    const email = await parser.parse(emlContent);

    console.log('Parsing content...');

    // Test Forwarded Headers
    const forwarded = parseForwardedMail(email.text || email.html || '');
    console.log('--- Forwarded Headers ---');
    console.log(JSON.stringify(forwarded, null, 2));

    // Test Transaction Details
    const extracted = parseTransactionDetails(email.html || email.text || '');

    console.log('--- Extracted Data ---');
    console.log(JSON.stringify(extracted, null, 2));
}

test().catch(console.error);
