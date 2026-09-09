import { PDFParse } from 'pdf-parse';

interface WorkerInput {
    buffer: number[];
}

export default async function parsePdf({ buffer }: WorkerInput): Promise<string> {
    const pdfBuffer = Buffer.from(buffer);
    const parser = new PDFParse({ data: pdfBuffer });
    const result = await parser.getText();
    return result.text;
}