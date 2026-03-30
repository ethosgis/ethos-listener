const { BlobServiceClient } = require('@azure/storage-blob');
const Busboy = require('busboy');
const { Readable } = require('stream');
const axios = require('axios');
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
    const uploadedBlobNames = [];
    let uploadedFilename = null;

    try {
        await new Promise((resolve, reject) => {
            busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
                let finalName = null;

                if (typeof filename === 'string') {
                    finalName = filename;
                } else if (filename && typeof filename === 'object' && typeof filename.filename === 'string') {
                    finalName = filename.filename;
                }

                if (!finalName) {
                    finalName = `upload-${Date.now()}`;
                }

                uploadedFilename = finalName;
                const blobName = `UserUpload_${finalName}`;
                uploadedBlobNames.push(blobName);
                const blockBlobClient = containerClient.getBlockBlobClient(blobName);

                const uploadPromise = blockBlobClient.uploadStream(file, undefined, undefined, {
                    blobHTTPHeaders: {
                        blobContentType: mimetype || 'application/octet-stream'
                    },
                    tier: 'Cold'
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

        const webhookUrl = 'https://fme-ethosgis.fmecloud.com/fmeapiv4/automations/e14809b1-5e85-4be8-811a-b39de49fcc51/1c79bb70-7a07-6fee-80df-c31463a8c4ff/message';
        // Only push to the FME webhook for blobs named like UserUpload_KICamCat...
        const kICamCatBlobNames = uploadedBlobNames.filter((name) => name.startsWith('UserUpload_KICamCat'));

        for (const blobName of kICamCatBlobNames) {
            await axios.post(webhookUrl, { blobName });
        }

        context.res = {
            status: 200,
            body: `${uploadedFilename} Received`
        };
    } catch (err) {
        context.res = {
            status: 500,
            body: "Upload failed: " + err.message
        };
    }
};
