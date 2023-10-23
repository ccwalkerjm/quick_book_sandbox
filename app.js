"use strict";

require("dotenv").config();

/**
 * Require the dependencies
 * @type {*|createApplication}
 */
var express = require("express");
var app = express();
var path = require("path");
var OAuthClient = require("intuit-oauth");
var bodyParser = require("body-parser");
var ngrok = process.env.NGROK_ENABLED === "true" ? require("ngrok") : null;

/**
 * Configure View and Handlebars
 */
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "/public")));
app.engine("html", require("ejs").renderFile);
app.set("view engine", "html");
app.use(bodyParser.json());

var urlencodedParser = bodyParser.urlencoded({ extended: false });

/**
 * App Variables
 * @type {null}
 */
var oauth2_token_json = null,
  redirectUri = "";

/**
 * Instantiate new Client
 * @type {OAuthClient}
 */

var oauthClient = null;

/**
 * Home Route
 */
app.get("/", function (req, res) {
  res.render("index");
});

/**
 * Get the AuthorizeUri
 */
app.get("/authUri", urlencodedParser, function (req, res) {
  oauthClient = new OAuthClient({
    clientId: req.query.json.clientId,
    clientSecret: req.query.json.clientSecret,
    environment: req.query.json.environment,
    redirectUri: req.query.json.redirectUri,
  });

  var authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state: "intuit-test",
  });
  res.send(authUri);
});

/**
 * Handle the callback to extract the `Auth Code` and exchange them for `Bearer-Tokens`
 */
app.get("/callback", function (req, res) {
  oauthClient
    .createToken(req.url)
    .then(function (authResponse) {
      oauth2_token_json = JSON.stringify(authResponse.getJson(), null, 2);
    })
    .catch(function (e) {
      console.error(e);
    });

  res.send("");
});

/**
 * Display the token : CAUTION : JUST for sample purposes
 */
app.get("/retrieveToken", function (req, res) {
  res.send(oauth2_token_json);
});

/**
 * Refresh the access-token
 */
app.get("/refreshAccessToken", function (req, res) {
  oauthClient
    .refresh()
    .then(function (authResponse) {
      console.log(
        "The Refresh Token is  " + JSON.stringify(authResponse.getJson())
      );
      oauth2_token_json = JSON.stringify(authResponse.getJson(), null, 2);
      res.send(oauth2_token_json);
    })
    .catch(function (e) {
      console.error(e);
    });
});
/**
 * Disconnect the user by revoking the access token
 */
app.get("/disconnect", function (req, res) {
  // Ensure the OAuthClient is setup
  if (!oauthClient) {
    return res.json({
      error: true,
      message: "OAuthClient is not setup. Cannot disconnect.",
    });
  }

  // Attempt to revoke the access token
  oauthClient
    .revoke({ token: oauthClient.getToken().access_token })
    .then(function (authResponse) {
      console.log("Tokens revoked : " + JSON.stringify(authResponse.json()));
      oauth2_token_json = null; // Clear the stored tokens
      res.send("Disconnected successfully. Tokens revoked.");
    })
    .catch(function (e) {
      console.error(e);
      res.send("Failed to disconnect. Unable to revoke tokens.");
    });
});

/**
 * getInvoiceByNumber ()
 */
app.get("/getInvoiceByNumber", function (req, res) {
  // Ensure the OAuthClient is setup
  if (!oauthClient) {
    return res.json({
      error: true,
      message: "OAuthClient is not setup. Cannot retrieve invoice.",
    });
  }

  // Extract the invoice number from the request query parameters
  const invoiceNumber = req.query.invoiceNumber;

  // Validate the invoiceNumber
  if (!invoiceNumber) {
    return res.status(400).json({
      error: true,
      message: "Invoice number is required.",
    });
  }

  // Get the company ID from the OAuth token
  const companyID = oauthClient.getToken().realmId;

  // Define the URL based on the environment
  const url =
    oauthClient.environment == "sandbox"
      ? OAuthClient.environment.sandbox
      : OAuthClient.environment.production;

  // Make API call to retrieve the invoice by number
  oauthClient
    .makeApiCall({
      url: `${url}v3/company/${companyID}/query?query=select * from Invoice where DocNumber='${invoiceNumber}'`,
    })
    .then(function (authResponse) {
      console.log(
        "The response for API call is: " + JSON.stringify(authResponse)
      );
      res.send(JSON.parse(authResponse.text()));
    })
    .catch(function (e) {
      console.error(e);
      res
        .status(500)
        .send("Failed to retrieve invoice. Check the logs for more details.");
    });
});

/**
 * getDueInvoices ()
 */
app.get("/getDueInvoices", function (req, res) {
    // Ensure the OAuthClient is setup
    if (!oauthClient) {
      return res.json({
        error: true,
        message: "OAuthClient is not setup. Cannot retrieve invoices.",
      });
    }
  
    const { fromDate, toDate, invoiceNumber, balance, Customer_DisplayName } = req.query;
  
    if ((!fromDate && toDate) || (fromDate && !toDate)) {
      return res.status(400).json({
        error: true,
        message: "Both fromDate and toDate are required together.",
      });
    }
  
    const companyID = oauthClient.getToken().realmId;
  
    const url =
      oauthClient.environment == "sandbox"
        ? OAuthClient.environment.sandbox
        : OAuthClient.environment.production;
  
        let conditions = [];

        if (fromDate && toDate) {
          conditions.push(`DueDate >= '${fromDate}' AND DueDate <= '${toDate}'`);
        }
        
        if (invoiceNumber) {
          conditions.push(`DocNumber = '${invoiceNumber}'`);
        }
        
        if (balance) {
          conditions.push(`Balance = ${balance}`);
        }
        
        if (customer) {
          conditions.push(`CustomerRef.DisplayName = '${Customer_DisplayName}'`);
        }
        
        if (conditions.length === 0) {
          return res.status(400).json({
            error: true,
            message: "At least one filter parameter must be provided.",
          });
        }
        
        const query = `SELECT * FROM Invoice WHERE ${conditions.join(" AND ")}`;
        console.log(`Final SQL Query: ${query}`);

    oauthClient
      .makeApiCall({
        url: `${url}v3/company/${companyID}/query?query=${encodeURIComponent(
          query
        )}`,
      })
      .then(function (authResponse) {
        console.log(
          "The response for API call is: " + JSON.stringify(authResponse)
        );
        res.send(JSON.parse(authResponse.text()));
      })
      .catch(function (e) {
        console.error(e);
        res
          .status(500)
          .send("Failed to retrieve invoices. Check the logs for more details.");
      });
  });

  app.get('/getInvoicesByUpdateRange', (req, res) => {
    if (!oauthClient) {
        return res.json({
            error: true,
            message: "OAuthClient is not setup. Cannot retrieve invoices.",
        });
    }
    
    const { startDateTime, endDateTime } = req.query;
    
    if (!startDateTime || !endDateTime) {
        return res.status(400).json({
            error: true,
            message: "Both startDateTime and endDateTime are required.",
        });
    }

    // Extract dates (without time) from startDateTime and endDateTime
    const startDate = startDateTime.split('T')[0];
    const endDate = endDateTime.split('T')[0];
    
    const companyID = oauthClient.getToken().realmId;
    
    const url =
        oauthClient.environment === "sandbox"
            ? OAuthClient.environment.sandbox
            : OAuthClient.environment.production;
    
    // Query considers both LastUpdatedTime and TxnDate
    const query = `
        SELECT * FROM Invoice 
        WHERE MetaData.LastUpdatedTime >= '${startDateTime}' 
            AND MetaData.LastUpdatedTime <= '${endDateTime}'
            AND TxnDate >= '${startDate}'
            AND TxnDate <= '${endDate}'
    `;
    
    console.log(`Final SQL Query: ${query}`);
    
    oauthClient
        .makeApiCall({
            url: `${url}v3/company/${companyID}/query?query=${encodeURIComponent(query)}`,
        })
        .then(function (authResponse) {
            console.log("API Response: ", authResponse);
            res.send(JSON.parse(authResponse.text()));
        })
        .catch(function (e) {
            console.error("API Error: ", e);
            res
                .status(500)
                .send("Failed to retrieve invoices. Check the logs for more details.");
        });
});


/**
 * createInvoice ()
 */
app.post("/createInvoice", function (req, res) {
  // Ensure the OAuthClient is setup
  if (!oauthClient) {
    return res.json({
      error: true,
      message: "OAuthClient is not setup. Cannot create invoice.",
    });
  }

  // Validate the request body
  const invoiceData = req.body;
  if (!invoiceData) {
    return res.status(400).json({
      error: true,
      message: "Invoice data is required.",
    });
  }

  // Get the company ID from the OAuth token
  const companyID = oauthClient.getToken().realmId;

  // Define the URL based on the environment
  const url =
    oauthClient.environment == "sandbox"
      ? OAuthClient.environment.sandbox
      : OAuthClient.environment.production;

  // Make API call to create the invoice
  oauthClient
    .makeApiCall({
      url: `${url}v3/company/${companyID}/invoice`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(invoiceData),
    })
    .then(function (authResponse) {
      console.log(
        "The response for API call is: " + JSON.stringify(authResponse)
      );
      res.send(JSON.parse(authResponse.text()));
    })
    .catch(function (e) {
      console.error(e);
      res
        .status(500)
        .send("Failed to create invoice. Check the logs for more details.");
    });
});

/**
 * getCompanyInfo ()
 */
app.get("/getCompanyInfo", function (req, res) {
  var companyID = oauthClient.getToken().realmId;

  var url =
    oauthClient.environment == "sandbox"
      ? OAuthClient.environment.sandbox
      : OAuthClient.environment.production;

  oauthClient
    .makeApiCall({
      url: url + "v3/company/" + companyID + "/companyinfo/" + companyID,
    })
    .then(function (authResponse) {
      console.log(
        "The response for API call is :" + JSON.stringify(authResponse)
      );
      res.send(JSON.parse(authResponse.text()));
    })
    .catch(function (e) {
      console.error(e);
    });
});

/**
 * Start server on HTTP (will use ngrok for HTTPS forwarding)
 */
const server = app.listen(process.env.PORT || 8000, () => {
  console.log(`💻 Server listening on port ${server.address().port}`);
  if (!ngrok) {
    redirectUri = `${server.address().port}` + "/callback";
    console.log(
      `💳  See the Sample App in your browser : ` +
        "http://localhost:" +
        `${server.address().port}`
    );
    console.log(
      `💳  Copy this into Redirect URI on the browser : ` +
        "http://localhost:" +
        `${server.address().port}` +
        "/callback"
    );
    console.log(
      `💻  Make Sure this redirect URI is also copied on your app in : https://developer.intuit.com`
    );
  }
});

/**
 * Optional : If NGROK is enabled
 */
if (ngrok) {
  console.log("NGROK Enabled");

  ngrok
    .connect({ addr: process.env.PORT || 8000 })
    .then((url) => {
      console.log(`💳  See the Sample App in your browser: ${url}`);
      redirectUri = url + "/callback";
      console.log(
        `💳  Copy and paste this Redirect URI on the browser :  ${redirectUri}`
      );
    })
    .catch((err) => {
      console.error("Error while connecting Ngrok", err);
      process.exit(1);
    });
}
