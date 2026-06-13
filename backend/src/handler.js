const { randomUUID } = require("crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
  BatchWriteCommand,
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
  onboardingSk: "ONBOARDING",
  behaviorProfileSk: "BEHAVIOR_PROFILE",
  deviceSk: (deviceId) => `DEVICE#${deviceId}`,
  eventSk: (timestamp, eventId) => `EVENT#${timestamp}#${eventId}`,
  routineSk: (routineId) => `ROUTINE#${routineId}`,
  recommendationSk: (recommendationId) => `RECOMMENDATION#${recommendationId}`,
  rhythmSk: (graphId) => `RHYTHM#${graphId}`,
  timelineSk: (sortOrder) => `TIMELINE#${String(sortOrder).padStart(2, "0")}`,
  sessionSk: (token) => `SESSION#${token}`,
};

const withoutPrivateFields = (user) => {
  if (!user) return user;

  const { PK, SK, passwordHash, entityType, ...safeUser } = user;

  return safeUser;
};

const withoutKeys = (item) => {
  if (!item) return item;

  const { PK, SK, ...rest } = item;

  return rest;
};

const getHouseholdItems = async (householdId) => {
  const result = await docClient.send(
    new QueryCommand({
      TableName: HOME_TABLE,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: {
        ":pk": keys.householdPk(householdId),
      },
    })
  );

  return result.Items || [];
};

const byEntityType = (items, entityType) =>
  items.filter((item) => item.entityType === entityType).map(withoutKeys);

const batchPut = async (items) => {
  const chunks = [];

  for (let i = 0; i < items.length; i += 25) {
    chunks.push(items.slice(i, i + 25));
  }

  for (const chunk of chunks) {
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [HOME_TABLE]: chunk.map((Item) => ({
            PutRequest: { Item },
          })),
        },
      })
    );
  }
};

const toMinutes = (time) => {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
};

const fromMinutes = (minutes) => {
  const normalized = Math.max(0, Math.min(1439, Math.round(minutes)));
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const gaussianSample = (mean, stdDev) => {
  const u1 = Math.random() || 0.0001;
  const u2 = Math.random() || 0.0001;
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

  return mean + z * stdDev;
};

const addMinutesToDate = (date, minutes) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setMinutes(minutes);

  return result.toISOString();
};

const getRiskForDevice = (deviceType) => {
  if (["water_motor", "geyser", "ac", "smart_plug"].includes(deviceType)) {
    return "medium";
  }

  if (["door_lock", "gas_stove", "cooking_appliance"].includes(deviceType)) {
    return "high";
  }

  return "low";
};

const getConsentStage = (riskLevel, confidence, automationComfort) => {
  if (riskLevel === "high") return "Blocked";
  if (riskLevel === "medium") return "Suggesting";
  if (automationComfort === "Only show suggestions") return "Suggesting";
  if (
    confidence >= 88 &&
    automationComfort === "Auto-run only low-risk actions"
  ) {
    return "Ready to automate";
  }
  if (confidence >= 80) return "Ready to automate";
  if (confidence >= 60) return "Suggesting";

  return "Insight";
};

const normalizeDeviceType = (device) =>
  String(device || "")
    .toLowerCase()
    .replaceAll(" ", "_")
    .replaceAll("/", "_");

const buildDevicesFromOnboarding = (householdId, devices, now) => {
  return (devices || []).map((device) => {
    const type = normalizeDeviceType(device);
    const riskLevel = getRiskForDevice(type);

    return {
      PK: keys.householdPk(householdId),
      SK: keys.deviceSk(`${type}_${randomUUID().slice(0, 8)}`),
      entityType: "DEVICE",
      householdId,
      deviceId: `${type}_${randomUUID().slice(0, 8)}`,
      name: device,
      type,
      room:
        type.includes("study") || type.includes("lamp")
          ? "Study Room"
          : type.includes("water")
            ? "Utility Area"
            : type.includes("speaker")
              ? "Living Room"
              : "Home",
      riskLevel,
      automationAllowed: riskLevel === "low",
      createdAt: now,
      updatedAt: now,
    };
  });
};

const buildBehaviorProfiles = (householdId, onboarding) => {
  const profiles = [];

  const members = onboarding.members || [];
  const devices = onboarding.devices || [];
  const primaryRoutine = onboarding.primaryRoutine || "";
  const studyPattern = onboarding.studyOrWorkPattern || "";
  const waterWindow = onboarding.waterWindow || "";
  const quietHours = onboarding.quietHours || "";

  const hasStudyLamp =
    devices.includes("Study lamp") || devices.includes("Lights");
  const hasFan = devices.includes("Fan");
  const hasSpeaker = devices.includes("Speaker");
  const hasWaterMotor = devices.includes("Water motor");
  const hasAC = devices.includes("AC");

  if (
    primaryRoutine.includes("Late-night study") ||
    studyPattern.includes("late at night") ||
    members.includes("Student")
  ) {
    if (hasStudyLamp) {
      profiles.push({
        profileId: "late_study_lamp",
        householdId,
        member: "Student",
        deviceType: "study_lamp",
        room: "Study Room",
        routineHint: "late_night_study",
        weekday: {
          triggerProbability: 0.86,
          startTimeMean: "22:15",
          startTimeVarianceMinutes: 24,
          durationMeanMinutes: 105,
          durationVarianceMinutes: 22,
        },
        weekend: {
          triggerProbability: 0.56,
          startTimeMean: "23:00",
          startTimeVarianceMinutes: 42,
          durationMeanMinutes: 80,
          durationVarianceMinutes: 30,
        },
      });
    }

    if (hasFan) {
      profiles.push({
        profileId: "late_study_fan",
        householdId,
        member: "Student",
        deviceType: "fan",
        room: "Study Room",
        routineHint: "late_night_study",
        weekday: {
          triggerProbability: 0.72,
          startTimeMean: "22:20",
          startTimeVarianceMinutes: 30,
          durationMeanMinutes: 120,
          durationVarianceMinutes: 28,
        },
        weekend: {
          triggerProbability: 0.48,
          startTimeMean: "23:10",
          startTimeVarianceMinutes: 45,
          durationMeanMinutes: 90,
          durationVarianceMinutes: 35,
        },
      });
    }
  }

  if (
    primaryRoutine.includes("Evening tuition") ||
    studyPattern.includes("Tuition")
  ) {
    if (hasSpeaker) {
      profiles.push({
        profileId: "tuition_quiet_speaker",
        householdId,
        member: "Tuition Teacher",
        deviceType: "speaker",
        room: "Hall",
        routineHint: "tuition_quiet_mode",
        weekday: {
          triggerProbability: 0.82,
          startTimeMean: "18:00",
          startTimeVarianceMinutes: 18,
          durationMeanMinutes: 120,
          durationVarianceMinutes: 15,
        },
        weekend: {
          triggerProbability: 0.25,
          startTimeMean: "18:30",
          startTimeVarianceMinutes: 50,
          durationMeanMinutes: 60,
          durationVarianceMinutes: 30,
        },
      });
    }

    if (hasStudyLamp) {
      profiles.push({
        profileId: "tuition_study_light",
        householdId,
        member: "Student",
        deviceType: "study_lamp",
        room: "Tuition Room",
        routineHint: "tuition_quiet_mode",
        weekday: {
          triggerProbability: 0.78,
          startTimeMean: "18:05",
          startTimeVarianceMinutes: 20,
          durationMeanMinutes: 115,
          durationVarianceMinutes: 20,
        },
        weekend: {
          triggerProbability: 0.22,
          startTimeMean: "18:25",
          startTimeVarianceMinutes: 45,
          durationMeanMinutes: 70,
          durationVarianceMinutes: 35,
        },
      });
    }
  }

  if (
    primaryRoutine.includes("Office return comfort") ||
    studyPattern.includes("Office return")
  ) {
    if (hasAC) {
      profiles.push({
        profileId: "evening_comfort_ac",
        householdId,
        member: "Office Professional",
        deviceType: "ac",
        room: "Bedroom",
        routineHint: "evening_comfort",
        weekday: {
          triggerProbability: 0.68,
          startTimeMean: "19:15",
          startTimeVarianceMinutes: 35,
          durationMeanMinutes: 80,
          durationVarianceMinutes: 25,
        },
        weekend: {
          triggerProbability: 0.38,
          startTimeMean: "20:00",
          startTimeVarianceMinutes: 55,
          durationMeanMinutes: 65,
          durationVarianceMinutes: 35,
        },
      });
    }

    if (hasFan) {
      profiles.push({
        profileId: "evening_comfort_fan",
        householdId,
        member: "Office Professional",
        deviceType: "fan",
        room: "Living Room",
        routineHint: "evening_comfort",
        weekday: {
          triggerProbability: 0.76,
          startTimeMean: "19:10",
          startTimeVarianceMinutes: 30,
          durationMeanMinutes: 110,
          durationVarianceMinutes: 30,
        },
        weekend: {
          triggerProbability: 0.46,
          startTimeMean: "20:10",
          startTimeVarianceMinutes: 50,
          durationMeanMinutes: 80,
          durationVarianceMinutes: 30,
        },
      });
    }
  }

  if (
    primaryRoutine.includes("Writer focus") ||
    studyPattern.includes("Writing")
  ) {
    if (hasStudyLamp) {
      profiles.push({
        profileId: "writer_focus_lamp",
        householdId,
        member: "Writer",
        deviceType: "study_lamp",
        room: "Study Corner",
        routineHint: "writer_focus_mode",
        weekday: {
          triggerProbability: 0.73,
          startTimeMean: "21:30",
          startTimeVarianceMinutes: 35,
          durationMeanMinutes: 90,
          durationVarianceMinutes: 24,
        },
        weekend: {
          triggerProbability: 0.64,
          startTimeMean: "22:00",
          startTimeVarianceMinutes: 42,
          durationMeanMinutes: 85,
          durationVarianceMinutes: 30,
        },
      });
    }
  }

  if (hasWaterMotor && !waterWindow.includes("No water")) {
    profiles.push({
      profileId: "water_motor_window",
      householdId,
      member: "Household",
      deviceType: "water_motor",
      room: "Utility Area",
      routineHint: "water_motor_reminder",
      weekday: {
        triggerProbability: waterWindow.includes("Irregular") ? 0.48 : 0.76,
        startTimeMean: waterWindow.includes("Evening") ? "18:45" : "07:10",
        startTimeVarianceMinutes: waterWindow.includes("Irregular") ? 75 : 22,
        durationMeanMinutes: 25,
        durationVarianceMinutes: 8,
      },
      weekend: {
        triggerProbability: waterWindow.includes("Irregular") ? 0.44 : 0.66,
        startTimeMean: waterWindow.includes("Evening") ? "19:00" : "07:35",
        startTimeVarianceMinutes: waterWindow.includes("Irregular") ? 80 : 35,
        durationMeanMinutes: 24,
        durationVarianceMinutes: 10,
      },
    });
  }

  if (hasSpeaker && !quietHours.includes("No fixed")) {
    profiles.push({
      profileId: "quiet_hours_speaker",
      householdId,
      member: "Household",
      deviceType: "speaker",
      room: "Living Room",
      routineHint: "quiet_home_mode",
      weekday: {
        triggerProbability: 0.68,
        startTimeMean: quietHours.includes("Afternoon")
          ? "14:15"
          : quietHours.includes("Late-night")
            ? "22:30"
            : "18:30",
        startTimeVarianceMinutes: 28,
        durationMeanMinutes: 90,
        durationVarianceMinutes: 24,
      },
      weekend: {
        triggerProbability: 0.51,
        startTimeMean: quietHours.includes("Afternoon")
          ? "14:30"
          : quietHours.includes("Late-night")
            ? "23:00"
            : "19:00",
        startTimeVarianceMinutes: 40,
        durationMeanMinutes: 70,
        durationVarianceMinutes: 30,
      },
    });
  }

  if (profiles.length === 0) {
    profiles.push({
      profileId: "default_evening_lights",
      householdId,
      member: "Household",
      deviceType: "lights",
      room: "Living Room",
      routineHint: "evening_home_mode",
      weekday: {
        triggerProbability: 0.62,
        startTimeMean: "19:00",
        startTimeVarianceMinutes: 45,
        durationMeanMinutes: 120,
        durationVarianceMinutes: 30,
      },
      weekend: {
        triggerProbability: 0.58,
        startTimeMean: "19:30",
        startTimeVarianceMinutes: 55,
        durationMeanMinutes: 110,
        durationVarianceMinutes: 40,
      },
    });
  }

  return profiles;
};

const generateEventsFromProfiles = (householdId, profiles, startDate) => {
  const events = [];

  for (let dayNumber = 1; dayNumber <= 21; dayNumber++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + dayNumber - 1);

    const isWeekend = [0, 6].includes(date.getDay());

    for (const profile of profiles) {
      const config = isWeekend ? profile.weekend : profile.weekday;

      if (Math.random() > config.triggerProbability) {
        continue;
      }

      const startMinutes = gaussianSample(
        toMinutes(config.startTimeMean),
        config.startTimeVarianceMinutes
      );

      const startTime = addMinutesToDate(date, startMinutes);
      const eventId = randomUUID();

      events.push({
        PK: keys.householdPk(householdId),
        SK: keys.eventSk(startTime, eventId),
        entityType: "EVENT",
        eventId,
        householdId,
        dayNumber,
        timestamp: startTime,
        timeOfDay: fromMinutes(startMinutes),
        deviceType: profile.deviceType,
        room: profile.room,
        action: "turned_on",
        memberHint: profile.member,
        routineHint: profile.routineHint,
        source: "simulated_telemetry",
      });
    }
  }

  return events;
};

const computeConfidence = (events, profileId, totalDays = 21) => {
  const relevantEvents = events.filter(
    (event) => event.routineHint === profileId
  );

  if (relevantEvents.length === 0) {
    return 0;
  }

  const daysSeen = new Set(relevantEvents.map((event) => event.dayNumber));

  let weightedScore = 0;
  let totalWeight = 0;

  for (let day = 1; day <= totalDays; day++) {
    const weight = Math.pow(1.05, day);
    totalWeight += weight;

    if (daysSeen.has(day)) {
      weightedScore += weight;
    }
  }

  const rawFrequency = daysSeen.size / totalDays;
  const recencyScore = weightedScore / totalWeight;

  const times = relevantEvents.map((event) => toMinutes(event.timeOfDay));
  const mean = times.reduce((sum, value) => sum + value, 0) / times.length;
  const variance =
    times.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
    times.length;

  const consistencyScore = Math.max(0, 1 - variance / 3600);

  return Math.round(
    (0.5 * recencyScore + 0.3 * rawFrequency + 0.2 * consistencyScore) * 100
  );
};

const titleFromRoutineHint = (routineHint) => {
  const titles = {
    late_night_study: "Late-Night Study Mode",
    tuition_quiet_mode: "Tuition Quiet Mode",
    evening_comfort: "Evening Comfort Mode",
    writer_focus_mode: "Writer Focus Mode",
    water_motor_reminder: "Water Motor Reminder",
    quiet_home_mode: "Quiet Home Mode",
    evening_home_mode: "Evening Home Mode",
  };

  return titles[routineHint] || "Household Rhythm";
};

const actionsFromRoutine = (routineHint, deviceType) => {
  if (routineHint === "late_night_study") {
    return ["Turn on study lamp", "Keep fan low", "Mute speaker notifications"];
  }

  if (routineHint === "tuition_quiet_mode") {
    return [
      "Lower speaker volume",
      "Keep study light active",
      "Reduce entertainment alerts",
    ];
  }

  if (routineHint === "evening_comfort") {
    return deviceType === "ac"
      ? ["Suggest AC comfort setup", "Ask before AC activation"]
      : ["Turn on fan", "Prepare evening comfort"];
  }

  if (routineHint === "writer_focus_mode") {
    return ["Turn on desk lamp", "Mute speaker notifications"];
  }

  if (routineHint === "water_motor_reminder") {
    return ["Send water motor reminder", "Ask before motor activation"];
  }

  if (routineHint === "quiet_home_mode") {
    return ["Lower speaker volume", "Avoid noisy suggestions"];
  }

  return ["Suggest routine", "Ask before action"];
};

const buildRoutinesFromEvents = (
  householdId,
  profiles,
  events,
  onboarding,
  now
) => {
  const groupedByRoutine = new Map();

  for (const profile of profiles) {
    if (!groupedByRoutine.has(profile.routineHint)) {
      groupedByRoutine.set(profile.routineHint, []);
    }

    groupedByRoutine.get(profile.routineHint).push(profile);
  }

  const routines = [];

  for (const [routineHint, groupedProfiles] of groupedByRoutine.entries()) {
    const relevantEvents = events.filter(
      (event) => event.routineHint === routineHint
    );

    if (relevantEvents.length < 3) {
      continue;
    }

    const deviceTypes = [
      ...new Set(relevantEvents.map((event) => event.deviceType)),
    ];
    const rooms = [...new Set(relevantEvents.map((event) => event.room))];

    const times = relevantEvents.map((event) => toMinutes(event.timeOfDay));
    const averageTime = fromMinutes(
      times.reduce((sum, value) => sum + value, 0) / times.length
    );

    const confidence = computeConfidence(events, routineHint, 21);
    const highestRisk = deviceTypes.some(
      (device) => getRiskForDevice(device) === "medium"
    )
      ? "medium"
      : "low";

    const routineId = `${routineHint}_${randomUUID().slice(0, 8)}`;
    const title = titleFromRoutineHint(routineHint);
    const consentStage = getConsentStage(
      highestRisk,
      confidence,
      onboarding.automationComfort
    );

    routines.push({
      PK: keys.householdPk(householdId),
      SK: keys.routineSk(routineId),
      entityType: "ROUTINE",
      householdId,
      routineId,
      title,
      trigger: `Around ${averageTime}`,
      condition: `${title} pattern detected`,
      actions: actionsFromRoutine(routineHint, deviceTypes[0]),
      evidence: `Detected ${relevantEvents.length} times over 21 simulated days`,
      confidence,
      riskLevel: highestRisk,
      consentStage,
      status: "active",
      devicesInvolved: deviceTypes,
      roomsInvolved: rooms,
      routineHint,
      explanation: `${title} was detected from recurring ${deviceTypes.join(
        ", "
      )} activity around ${averageTime}.`,
      createdAt: now,
      updatedAt: now,
    });
  }

  return routines.sort((a, b) => b.confidence - a.confidence);
};

const buildRecommendations = (householdId, routines, now) => {
  return routines.slice(0, 5).map((routine) => {
    const recommendationId = `${routine.routineId}_recommendation`;

    return {
      PK: keys.householdPk(householdId),
      SK: keys.recommendationSk(recommendationId),
      entityType: "RECOMMENDATION",
      householdId,
      recommendationId,
      routineId: routine.routineId,
      title: routine.title,
      summary: routine.explanation,
      confidence: routine.confidence,
      riskLevel: routine.riskLevel,
      consentStage: routine.consentStage,
      status: "open",
      createdAt: now,
      updatedAt: now,
    };
  });
};

const buildRhythmGraph = (householdId, routines, now) => {
  return routines.map((routine) => {
    const graphId = `${routine.routineId}_edge`;

    return {
      PK: keys.householdPk(householdId),
      SK: keys.rhythmSk(graphId),
      entityType: "RHYTHM_EDGE",
      householdId,
      graphId,
      source:
        routine.routineHint === "water_motor_reminder"
          ? "Water Supply Window"
          : routine.routineHint === "evening_comfort"
            ? "Office Return"
            : routine.routineHint === "writer_focus_mode"
              ? "Writer"
              : routine.routineHint === "tuition_quiet_mode"
                ? "Tuition Time"
                : "Household Member",
      relation:
        routine.riskLevel === "medium" ? "requires approval for" : "triggers",
      target: routine.title,
      timing: routine.trigger,
      routine: routine.title,
      confidence: routine.confidence,
      createdAt: now,
      updatedAt: now,
    };
  });
};

const buildTimeline = (householdId, routines, now) => {
  const topConfidence = routines[0]?.confidence || 0;

  const stages = [
    {
      sortOrder: 0,
      day: "Day 0",
      title: "Onboarding context only",
      description:
        "HomeMate starts with household answers and observes before suggesting.",
      confidenceRange: "0–25%",
    },
    {
      sortOrder: 3,
      day: "Day 3",
      title: "Early weak signals",
      description:
        "Repeated device activity begins appearing, but confidence remains low.",
      confidenceRange: "35–50%",
    },
    {
      sortOrder: 7,
      day: "Day 7",
      title: "Patterns emerging",
      description:
        "HomeMate identifies recurring time windows and starts explainable suggestions.",
      confidenceRange: "60–75%",
    },
    {
      sortOrder: 21,
      day: "Day 21",
      title: "Trusted rhythm",
      description: `Top routine confidence reached ${topConfidence}%. Consent-based actions are now available.`,
      confidenceRange: `${Math.max(70, topConfidence - 10)}–${topConfidence}%`,
    },
  ];

  return stages.map((stage) => ({
    PK: keys.householdPk(householdId),
    SK: keys.timelineSk(stage.sortOrder),
    entityType: "TIMELINE_STAGE",
    householdId,
    stageId: `${householdId}_${stage.sortOrder}`,
    ...stage,
    createdAt: now,
    updatedAt: now,
  }));
};

const buildAnticipatoryAction = (householdId, routines, now) => {
  const routine = routines.find(
    (item) => item.riskLevel === "low" && item.confidence >= 80
  );

  if (!routine) return null;

  return {
    PK: keys.householdPk(householdId),
    SK: "ANTICIPATORY_ACTION",
    entityType: "ANTICIPATORY_ACTION",
    householdId,
    title: `HomeMate prepared ${routine.title.toLowerCase()}.`,
    description: `This is a low-risk routine with ${routine.confidence}% confidence. Undo is available.`,
    confidence: routine.confidence,
    riskLevel: routine.riskLevel,
    routineId: routine.routineId,
    undoAvailable: true,
    createdAt: now,
    updatedAt: now,
  };
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
      household: withoutKeys(householdRecord),
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
      household: withoutKeys(householdResult.Item),
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

    return jsonResponse(200, {
      success: true,
      household: withoutKeys(result.Item),
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

module.exports.saveOnboarding = async (event) => {
  try {
    const householdId = event.pathParameters?.householdId;
    const body = parseBody(event);

    if (!householdId || !body) {
      return jsonResponse(400, {
        success: false,
        message: "householdId and valid JSON body are required",
      });
    }

    const now = new Date().toISOString();

    const onboarding = {
      city: body.city || "Mumbai",
      householdType: body.householdType || "Mixed Indian household",
      members: Array.isArray(body.members) ? body.members : [],
      primaryRoutine: body.primaryRoutine || "Late-night study",
      studyOrWorkPattern:
        body.studyOrWorkPattern || "Someone studies or works late at night",
      waterWindow: body.waterWindow || "Morning water supply window",
      quietHours: body.quietHours || "Evening quiet hours",
      powerSensitivity: body.powerSensitivity || "Medium power-cut sensitivity",
      automationComfort: body.automationComfort || "Ask before action",
      devices: Array.isArray(body.devices) ? body.devices : [],
    };

    await docClient.send(
      new PutCommand({
        TableName: HOME_TABLE,
        Item: {
          PK: keys.householdPk(householdId),
          SK: keys.onboardingSk,
          entityType: "ONBOARDING",
          householdId,
          ...onboarding,
          createdAt: now,
          updatedAt: now,
        },
      })
    );

    await docClient.send(
      new UpdateCommand({
        TableName: HOME_TABLE,
        Key: {
          PK: keys.householdPk(householdId),
          SK: keys.profileSk,
        },
        UpdateExpression:
          "SET onboardingStatus = :onboardingStatus, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":onboardingStatus": "completed",
          ":updatedAt": now,
        },
      })
    );

    return jsonResponse(200, {
      success: true,
      message: "Onboarding saved successfully",
      householdId,
      onboarding,
    });
  } catch (error) {
    console.error("saveOnboarding error:", error);

    return jsonResponse(500, {
      success: false,
      message: "Failed to save onboarding",
      error: error.message,
    });
  }
};

module.exports.getOnboarding = async (event) => {
  try {
    const householdId = event.pathParameters?.householdId;

    const result = await docClient.send(
      new GetCommand({
        TableName: HOME_TABLE,
        Key: {
          PK: keys.householdPk(householdId),
          SK: keys.onboardingSk,
        },
      })
    );

    if (!result.Item) {
      return jsonResponse(404, {
        success: false,
        message: "Onboarding not found",
      });
    }

    return jsonResponse(200, {
      success: true,
      onboarding: withoutKeys(result.Item),
    });
  } catch (error) {
    console.error("getOnboarding error:", error);

    return jsonResponse(500, {
      success: false,
      message: "Failed to load onboarding",
      error: error.message,
    });
  }
};

module.exports.generateHomeRhythm = async (event) => {
  try {
    const householdId = event.pathParameters?.householdId;

    const onboardingResult = await docClient.send(
      new GetCommand({
        TableName: HOME_TABLE,
        Key: {
          PK: keys.householdPk(householdId),
          SK: keys.onboardingSk,
        },
      })
    );

    if (!onboardingResult.Item) {
      return jsonResponse(400, {
        success: false,
        message: "Complete onboarding before generating Home Rhythm",
      });
    }

    const onboarding = withoutKeys(onboardingResult.Item);
    const now = new Date().toISOString();

    const behaviorProfiles = buildBehaviorProfiles(householdId, onboarding);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 20);

    const devices = buildDevicesFromOnboarding(
      householdId,
      onboarding.devices || [],
      now
    );

    const events = generateEventsFromProfiles(
      householdId,
      behaviorProfiles,
      startDate
    );
    const routines = buildRoutinesFromEvents(
      householdId,
      behaviorProfiles,
      events,
      onboarding,
      now
    );
    const recommendations = buildRecommendations(householdId, routines, now);
    const rhythmGraph = buildRhythmGraph(householdId, routines, now);
    const timeline = buildTimeline(householdId, routines, now);
    const anticipatoryAction = buildAnticipatoryAction(
      householdId,
      routines,
      now
    );

    const records = [
      {
        PK: keys.householdPk(householdId),
        SK: keys.behaviorProfileSk,
        entityType: "BEHAVIOR_PROFILE",
        householdId,
        behavioralProfiles: behaviorProfiles,
        createdAt: now,
        updatedAt: now,
      },
      ...devices,
      ...events,
      ...routines,
      ...recommendations,
      ...rhythmGraph,
      ...timeline,
    ];

    if (anticipatoryAction) {
      records.push(anticipatoryAction);
    }

    await batchPut(records);

    await docClient.send(
      new UpdateCommand({
        TableName: HOME_TABLE,
        Key: {
          PK: keys.householdPk(householdId),
          SK: keys.profileSk,
        },
        UpdateExpression:
          "SET simulationStatus = :simulationStatus, learningMaturity = :learningMaturity, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":simulationStatus": "generated",
          ":learningMaturity": "Day 21",
          ":updatedAt": now,
        },
      })
    );

    return jsonResponse(200, {
      success: true,
      message: "Home Rhythm generated successfully",
      householdId,
      summary: {
        behaviorProfiles: behaviorProfiles.length,
        events: events.length,
        routines: routines.length,
        recommendations: recommendations.length,
        rhythmEdges: rhythmGraph.length,
        timelineStages: timeline.length,
        anticipatoryAction: Boolean(anticipatoryAction),
      },
      topRoutine: routines[0] ? withoutKeys(routines[0]) : null,
    });
  } catch (error) {
    console.error("generateHomeRhythm error:", error);

    return jsonResponse(500, {
      success: false,
      message: "Failed to generate Home Rhythm",
      error: error.message,
    });
  }
};

module.exports.getDashboard = async (event) => {
  try {
    const householdId = event.pathParameters?.householdId;
    const items = await getHouseholdItems(householdId);

    const profile = withoutKeys(
      items.find((item) => item.entityType === "HOUSEHOLD_PROFILE")
    );
    const onboarding = withoutKeys(
      items.find((item) => item.entityType === "ONBOARDING")
    );
    const routines = byEntityType(items, "ROUTINE").sort(
      (a, b) => b.confidence - a.confidence
    );
    const recommendations = byEntityType(items, "RECOMMENDATION").sort(
      (a, b) => b.confidence - a.confidence
    );
    const devices = byEntityType(items, "DEVICE");
    const anticipatoryAction = withoutKeys(
      items.find((item) => item.entityType === "ANTICIPATORY_ACTION")
    );

    if (!profile) {
      return jsonResponse(404, {
        success: false,
        message: "Household not found",
      });
    }

    return jsonResponse(200, {
      success: true,
      household: profile,
      onboarding,
      summary: {
        routinesDetected: routines.length,
        devicesConnected: devices.length,
        topConfidence: routines[0]?.confidence || 0,
        learningMaturity: profile.learningMaturity || "Day 0",
      },
      topRoutine: routines[0] || null,
      topRecommendation: recommendations[0] || null,
      anticipatoryAction: anticipatoryAction || null,
      contextSignals: onboarding
        ? [
            onboarding.primaryRoutine,
            onboarding.waterWindow,
            onboarding.quietHours,
            onboarding.powerSensitivity,
            onboarding.automationComfort,
          ].filter(Boolean)
        : [],
    });
  } catch (error) {
    console.error("getDashboard error:", error);

    return jsonResponse(500, {
      success: false,
      message: "Failed to load dashboard",
      error: error.message,
    });
  }
};

module.exports.getRoutines = async (event) => {
  try {
    const householdId = event.pathParameters?.householdId;
    const items = await getHouseholdItems(householdId);
    const routines = byEntityType(items, "ROUTINE").sort(
      (a, b) => b.confidence - a.confidence
    );

    return jsonResponse(200, {
      success: true,
      routines,
    });
  } catch (error) {
    console.error("getRoutines error:", error);

    return jsonResponse(500, {
      success: false,
      message: "Failed to load routines",
      error: error.message,
    });
  }
};

module.exports.getTimeline = async (event) => {
  try {
    const householdId = event.pathParameters?.householdId;
    const items = await getHouseholdItems(householdId);
    const timeline = byEntityType(items, "TIMELINE_STAGE").sort(
      (a, b) => a.sortOrder - b.sortOrder
    );

    return jsonResponse(200, {
      success: true,
      timeline,
    });
  } catch (error) {
    console.error("getTimeline error:", error);

    return jsonResponse(500, {
      success: false,
      message: "Failed to load timeline",
      error: error.message,
    });
  }
};

module.exports.getRhythm = async (event) => {
  try {
    const householdId = event.pathParameters?.householdId;
    const items = await getHouseholdItems(householdId);
    const rhythm = byEntityType(items, "RHYTHM_EDGE").sort(
      (a, b) => b.confidence - a.confidence
    );

    return jsonResponse(200, {
      success: true,
      rhythm,
    });
  } catch (error) {
    console.error("getRhythm error:", error);

    return jsonResponse(500, {
      success: false,
      message: "Failed to load rhythm graph",
      error: error.message,
    });
  }
};
