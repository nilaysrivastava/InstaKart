const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const { jsonResponse, parseBody } = require("./utils/response");
const {
  normalizeEmail,
  createUserIdFromEmail,
  createHouseholdIdFromUserId,
  hashPassword,
  verifyPassword,
  createSessionToken,
} = require("./utils/auth");

const AWS_REGION = process.env.AWS_REGION || "ap-south-1";
const HOME_TABLE = process.env.HOME_TABLE || "homemate-dev";

const client = new DynamoDBClient({ region: AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const keys = {
  userPk: (userId) => `USER#${userId}`,
  householdPk: (householdId) => `HOUSEHOLD#${householdId}`,
  profileSk: "PROFILE",
  sessionSk: (token) => `SESSION#${token}`,
};

const withoutPrivateFields = (user) => {
  if (!user) return user;

  const { PK, SK, passwordHash, entityType, ...safeUser } = user;

  return safeUser;
};

module.exports.health = async () => {
  return jsonResponse(200, {
    success: true,
    service: "homemate-api",
    message: "HomeMate backend is healthy",
    table: HOME_TABLE,
    timestamp: new Date().toISOString(),
  });
};

module.exports.signup = async (event) => {
  try {
    const body = parseBody(event);

    if (!body) {
      return jsonResponse(400, {
        success: false,
        message: "Invalid JSON body",
      });
    }

    const householdName = String(body.householdName || "").trim();
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");

    if (!householdName || !email || !password) {
      return jsonResponse(400, {
        success: false,
        message: "householdName, email, and password are required",
      });
    }

    if (password.length < 6) {
      return jsonResponse(400, {
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const userId = createUserIdFromEmail(email);
    const householdId = createHouseholdIdFromUserId(userId);
    const now = new Date().toISOString();
    const sessionToken = createSessionToken();

    const userRecord = {
      PK: keys.userPk(userId),
      SK: keys.profileSk,
      entityType: "USER_PROFILE",
      userId,
      householdId,
      householdName,
      email,
      passwordHash: hashPassword(password),
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };

    const householdRecord = {
      PK: keys.householdPk(householdId),
      SK: keys.profileSk,
      entityType: "HOUSEHOLD_PROFILE",
      householdId,
      userId,
      householdName,
      email,
      onboardingStatus: "not_started",
      simulationStatus: "not_generated",
      learningMaturity: "Day 0",
      createdAt: now,
      updatedAt: now,
    };

    const sessionRecord = {
      PK: keys.userPk(userId),
      SK: keys.sessionSk(sessionToken),
      entityType: "SESSION",
      userId,
      householdId,
      sessionToken,
      createdAt: now,
    };

    await docClient.send(
      new PutCommand({
        TableName: HOME_TABLE,
        Item: userRecord,
        ConditionExpression: "attribute_not_exists(PK)",
      })
    );

    await docClient.send(
      new PutCommand({
        TableName: HOME_TABLE,
        Item: householdRecord,
      })
    );

    await docClient.send(
      new PutCommand({
        TableName: HOME_TABLE,
        Item: sessionRecord,
      })
    );

    return jsonResponse(201, {
      success: true,
      message: "Signup successful",
      user: withoutPrivateFields(userRecord),
      household: {
        householdId,
        userId,
        householdName,
        email,
        onboardingStatus: "not_started",
        simulationStatus: "not_generated",
        learningMaturity: "Day 0",
      },
      sessionToken,
    });
  } catch (error) {
    console.error("signup error:", error);

    if (error.name === "ConditionalCheckFailedException") {
      return jsonResponse(409, {
        success: false,
        message: "An account already exists for this email. Please login.",
      });
    }

    return jsonResponse(500, {
      success: false,
      message: "Signup failed",
      error: error.message,
    });
  }
};

module.exports.login = async (event) => {
  try {
    const body = parseBody(event);

    if (!body) {
      return jsonResponse(400, {
        success: false,
        message: "Invalid JSON body",
      });
    }

    const email = normalizeEmail(body.email);
    const password = String(body.password || "");

    if (!email || !password) {
      return jsonResponse(400, {
        success: false,
        message: "email and password are required",
      });
    }

    const userId = createUserIdFromEmail(email);

    const userResult = await docClient.send(
      new GetCommand({
        TableName: HOME_TABLE,
        Key: {
          PK: keys.userPk(userId),
          SK: keys.profileSk,
        },
      })
    );

    const user = userResult.Item;

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return jsonResponse(401, {
        success: false,
        message: "Invalid email or password",
      });
    }

    const sessionToken = createSessionToken();
    const now = new Date().toISOString();

    await docClient.send(
      new PutCommand({
        TableName: HOME_TABLE,
        Item: {
          PK: keys.userPk(userId),
          SK: keys.sessionSk(sessionToken),
          entityType: "SESSION",
          userId,
          householdId: user.householdId,
          sessionToken,
          createdAt: now,
        },
      })
    );

    await docClient.send(
      new UpdateCommand({
        TableName: HOME_TABLE,
        Key: {
          PK: keys.userPk(userId),
          SK: keys.profileSk,
        },
        UpdateExpression:
          "SET lastLoginAt = :lastLoginAt, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":lastLoginAt": now,
          ":updatedAt": now,
        },
      })
    );

    const householdResult = await docClient.send(
      new GetCommand({
        TableName: HOME_TABLE,
        Key: {
          PK: keys.householdPk(user.householdId),
          SK: keys.profileSk,
        },
      })
    );

    return jsonResponse(200, {
      success: true,
      message: "Login successful",
      user: withoutPrivateFields(user),
      household: householdResult.Item
        ? {
            householdId: householdResult.Item.householdId,
            userId: householdResult.Item.userId,
            householdName: householdResult.Item.householdName,
            email: householdResult.Item.email,
            onboardingStatus: householdResult.Item.onboardingStatus,
            simulationStatus: householdResult.Item.simulationStatus,
            learningMaturity: householdResult.Item.learningMaturity,
          }
        : null,
      sessionToken,
    });
  } catch (error) {
    console.error("login error:", error);

    return jsonResponse(500, {
      success: false,
      message: "Login failed",
      error: error.message,
    });
  }
};

module.exports.getHouseholdProfile = async (event) => {
  try {
    const householdId = event.pathParameters?.householdId;

    if (!householdId) {
      return jsonResponse(400, {
        success: false,
        message: "householdId is required",
      });
    }

    const result = await docClient.send(
      new GetCommand({
        TableName: HOME_TABLE,
        Key: {
          PK: keys.householdPk(householdId),
          SK: keys.profileSk,
        },
      })
    );

    if (!result.Item) {
      return jsonResponse(404, {
        success: false,
        message: "Household not found",
      });
    }

    const { PK, SK, entityType, ...household } = result.Item;

    return jsonResponse(200, {
      success: true,
      household,
    });
  } catch (error) {
    console.error("getHouseholdProfile error:", error);

    return jsonResponse(500, {
      success: false,
      message: "Failed to load household profile",
      error: error.message,
    });
  }
};
