const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");
const { BlobServiceClient } = require("@azure/storage-blob"); // still here if you use it elsewhere
const axios = require("axios");
const crypto = require("crypto");
require("dotenv").config();

module.exports = async function (context, req) {
  try {
    // (Optional) Blob client kept if you use it elsewhere
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING
    );

    const tableClient = new TableClient(
      `https://${process.env.AZURE_STORAGE_ACCOUNT_NAME}.table.core.windows.net`,
      "DevTest",
      new AzureNamedKeyCredential(
        process.env.AZURE_STORAGE_ACCOUNT_NAME,
        process.env.AZURE_STORAGE_ACCOUNT_KEY
      )
    );

    if (!req.body || typeof req.body !== "object") {
      context.res = { status: 400, body: "Body must be a JSON object." };
      return;
    }

    // Clean and sanitize incoming payload
    const payload = { ...req.body };
    // Prevent users from overriding table keys
    delete payload.partitionKey;
    delete payload.rowKey;

    // Azure Tables supports primitives; stringify complex values
    for (const [k, v] of Object.entries(payload)) {
      if (v !== null && typeof v === "object") {
        payload[k] = JSON.stringify(v);
      }
    }

    // Server-generated unique RowKey
    const generatedId =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const entity = {
      partitionKey: "system-test", // <- fixed partition
      rowKey: generatedId,         // <- server-generated unique id
      ...payload,                  // <- whatever fields were provided
    };

    await tableClient.createEntity(entity);

    context.res = {
      status: 201,
      body: `Payload saved with id: ${generatedId} in partition "system-test".`,
    };
  } catch (error) {
    context.log(`Error processing the request: ${error.message}`);
    context.res = {
      status: 500,
      body: `An error occurred while processing your request: ${error.message}`,
    };
  }
};
