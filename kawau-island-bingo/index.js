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
                const blobName = `KawauWallabyBingo_${finalName}`;
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

         // ✅ Send blobName to FME webhook after upload
         const webhookUrl = 'https://fme.ethosgis.com/fmerest/v3/automations/workflows/555a990c-21b1-4d83-b9bc-52cc98960b0d/fcb52836-5e08-8ff0-9e86-352fd2655108/message';
         await axios.post(webhookUrl, { blobName });
 
         context.res = {
             status: 200,
             body: `${uploadedFilename} received. You will receive a confirmation email shortly once the file has been processed.`
         };
     } catch (err) {
         context.res = {
             status: 500,
             body: "Process failed. Something went wrong on the server. Please contact Enric or Willy for assistance."
         };
     }
 };
 

       

