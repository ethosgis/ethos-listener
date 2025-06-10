const { BlobServiceClient } = require('@azure/storage-blob');
const Busboy = require('busboy');
const { Readable } = require('stream');
require('dotenv').config();

module.exports = async function (context, req) {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.BLOB_CONTAINER_NAME;

    if (!connectionString || !containerName) {
        context.res = {
            status: 500,
            body: "Missing AZURE_STORAGE_CONNECTION_STRING or BLOB_CONTAINER_NAME"
        };
        return;
    }

    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);

    const contentType = req.headers['content-type'] || req.headers['Content-Type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
        context.res = {
            status: 400,
            body: "Content-Type must be multipart/form-data"
        };
        return;
    }

    const busboy = Busboy({ headers: req.headers });
    const fileUploadPromises = [];

    try {
        await new Promise((resolve, reject) => {
            busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
                // Fix: Ensure filename is a clean string
                const cleanFilename = typeof filename === 'string'
                    ? filename
                    : (Buffer.isBuffer(filename) ? filename.toString() : `upload-${Date.now()}`);

                const blobName = `UserUpload_${cleanFilename}`;
                const blockBlobClient = containerClient.getBlockBlobClient(blobName);

                const uploadPromise = blockBlobClient.uploadStream(file, undefined, undefined, {
                    blobHTTPHeaders: {
                        blobContentType: mimetype || 'application/octet-stream'
                    }
                });

                fileUploadPromises.push(uploadPromise);
            });

            busboy.on('finish', async () => {
                try {
                    await Promise.all(fileUploadPromises);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });

            busboy.on('error', reject);

            const bodyStream = Readable.from(req.rawBody);
            bodyStream.pipe(busboy);
        });

        context.res = {
            status: 200,
            body: "File uploaded successfully with correct name and content type."
        };
    } catch (err) {
        context.log("Upload error:", err.message);
        context.res = {
            status: 500,
            body: "Upload failed: " + err.message
        };
    }
};
