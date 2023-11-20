/* authentication.js

Authenication implementations for Taegis.
*/
const fetch = require('node-fetch'); // Use node-fetch for making HTTP requests

async function checkUsername(requestUrl, username) {
  console.debug("Checking login type for username...");
  const usernameEndpoint = "/auth/username";

  const response = await fetch(requestUrl + usernameEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ username }),
    timeout: 300
  });
  console.debug(await response.text());

  return response.json();
}

function getOAuthFromEnv(environment) {
  const client_id_env_var = process.env[environment + "_CLIENT_ID"] || "CLIENT_ID";
  const client_secret_env_var = process.env[environment + "_CLIENT_SECRET"] || "CLIENT_SECRET";

  const client_id = process.env[client_id_env_var];
  const client_secret = process.env[client_secret_env_var];

  return [client_id, client_secret];
}

async function getToken(environment, requestUrl) {
  let access_token = getCachedToken(environment);

  if (!access_token) {
    const [client_id, client_secret] = getOAuthFromEnv(environment);
    if (client_id && client_secret) {
      access_token = await getTokenByOAuth(requestUrl, client_id, client_secret);
    } else {
      const username = prompt("Username: ");
      const response = await checkUsername(requestUrl, username);

      if (response.login_type === "username-password") {
        access_token = await getTokenByPasswordGrant(requestUrl, username);
      } else if (response.login_type === "sso") {
        access_token = await getTokenBySSODeviceCode(requestUrl);
      } else {
        throw new Error("No known authentication method for user");
      }
    }

    writeToConfig(environment, "access_token", access_token);
  }

  return access_token;
}

function getCachedToken(env) {
  const token = process.env[env + "_access_token"];
  const token_exp = getTokenExp(token);

  if (token && token_exp >= Date.now()) {
    return token;
  }

  return null;
}

async function getTokenByOAuth(requestUrl, client_id, client_secret) {
  const authUri = "/auth/api/v2/auth/token";

  const response = await fetch(requestUrl + authUri, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id,
      client_secret
    }),
  });

  const { access_token } = await response.json();
  
  if (!access_token) {
    throw new Error("Access token not found. Check client_id and client_secret credentials");
  }

  return access_token;
}

async function getTokenByPasswordGrant(requestUrl, username, password = null) {
  const authUri = "/auth/api/v2/auth/token";

  if (!password) {
    password = prompt("Password: ");
  }

  const response = await fetch(requestUrl + authUri, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "password",
      username,
      password,
    }),
    timeout: 300
  });

  const json = await response.json();
  let access_token = json.access_token;

  if (!access_token) {
    const mfa_token = json.mfa_token;

    if (!mfa_token) {
      throw new Error("Access token not found");
    }

    const mfa_input = prompt("MFA Token: ");
    const mfaResponse = await fetch(requestUrl + authUri, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "http://ctpx.secureworks.com/grant-type/mfa-otp",
        mfa_token,
        otp: mfa_input
      }),
      timeout: 300,
    });

    const mfaJson = await mfaResponse.json();
    access_token = mfaJson.access_token;
    
    if (!access_token) {
      throw new Error("Access token not found. Check credentials provided to SSO provider.");
    }
  }

  return access_token;
}

async function getTokenBySSODeviceCode(requestUrl) {
  console.debug("Trying by SSO device code auth url...");
  const initEndpoint = "/auth/device/code/auth";
  const tokenEndpoint = "/auth/device/code/token";

  const initResponse = await fetch(requestUrl + initEndpoint, {
    method: "POST",
    timeout: 300
  });

  const deviceCodeFlow = await initResponse.json();

  if (deviceCodeFlow.verification_uri_complete) {
    console.log("Copy URL into a browser: " + deviceCodeFlow.verification_uri_complete);
  } else if (deviceCodeFlow.verification_uri && deviceCodeFlow.user_code) {
    console.log("Copy URL into a browser: " +
      deviceCodeFlow.verification_uri +
      "?user_code=" + deviceCodeFlow.user_code);
  } else {
    console.error("Cannot login via SSO: " + JSON.stringify(deviceCodeFlow) + "...");
    return null;
  }

  const tokenResponse = await fetch(requestUrl + tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      device_code: deviceCodeFlow.device_code,
      interval: deviceCodeFlow.interval,
    }),
    timeout: 300
  });

  const tokenJson = await tokenResponse.json();
  const access_token = tokenJson.access_token;

  if (!access_token) {
    throw new Error("Access token not found. Check credentials and MFA input.");
  }

  return access_token;
}

module.exports = {
  checkUsername,
  getOAuthFromEnv,
  getToken,
  getCachedToken,
  getTokenByOAuth,
  getTokenByPasswordGrant,
  getTokenBySSODeviceCode
};

