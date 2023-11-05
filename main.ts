type DailyReadiness = {
  day: string;
  score: number;
};

type DailyReadinessResponse = {
  data: DailyReadiness[];
};

type DailySleep = {
  day: string;
  score: number;
};

type DailySleepResponse = {
  data: DailySleep[];
};

type Session = {
  start_datetime: string;
  end_datetime: string;
};

type SessionResponse = {
  data: Session[];
};

const OURA_RING_HOST = "https://api.ouraring.com/v2";

const props = PropertiesService.getScriptProperties().getProperties();

const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

function main() {
  const latestReadness = getDailyReadiness().data.at(-1);
  if (latestReadness === undefined) {
    return;
  }

  const latestSleep = getDailySleep().data.at(-1);
  if (latestSleep === undefined) {
    return;
  }

  const sessions = getSession().data;
  const sessionTime = calcSessionTime(sessions);

  if (canPost(latestReadness.day)) {
    post(latestReadness, latestSleep, sessionTime);
  }
}

function doGet(e: any) {
  main();

  const result = {};
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  output.setContent(JSON.stringify(result));
  return output;
}

function post(latestRediness: DailyReadiness, latestSleep: DailySleep, sessionTime: number) {
  const iconNo = getIconNo(latestRediness);
  const emoji = `:condition_${iconNo}:`;
  var text = `${emoji} (コンディション: ${latestRediness.score}点, 睡眠: ${latestSleep.score}点`;
  text += sessionTime === 0 ? ")" : `, 瞑想: ${sessionTime}分)`;
  postToSlack(text);
  updateSlackStatus(`${emoji}`, `${latestRediness.score}点`);

  const values = [[latestRediness.day, latestRediness.score, latestSleep.score, sessionTime]];
  const row = sheet.getLastRow() === 0 ? 1 : sheet.getDataRange().getLastRow() + 1;
  sheet.getRange(row, 1, 1, values[0].length).setValues(values);
}

function getDailyReadiness(): DailyReadinessResponse {
  const start_date = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd");
  const end_date = Utilities.formatDate(getTomorrow(), "Asia/Tokyo", "yyyy-MM-dd");
  const url = `${OURA_RING_HOST}/usercollection/daily_readiness?start_date=${start_date}&end_date=${end_date}`;

  const params: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: "get",
    contentType: "application/json",
    headers: { Authorization: `Bearer ${props.OURA_RING_TOKEN}` },
  };

  const contents = UrlFetchApp.fetch(url, params).getContentText();
  const response = JSON.parse(contents) as DailyReadinessResponse;
  return response;
}

function getDailySleep(): DailySleepResponse {
  const start_date = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd");
  const end_date = Utilities.formatDate(getTomorrow(), "Asia/Tokyo", "yyyy-MM-dd");
  const url = `${OURA_RING_HOST}/usercollection/daily_sleep?start_date=${start_date}&end_date=${end_date}`;

  const params: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: "get",
    contentType: "application/json",
    headers: { Authorization: `Bearer ${props.OURA_RING_TOKEN}` },
  };

  const contents = UrlFetchApp.fetch(url, params).getContentText();
  const response = JSON.parse(contents) as DailySleepResponse;
  return response;
}

function getSession(): SessionResponse {
  const start_date = Utilities.formatDate(getYesterday(), "Asia/Tokyo", "yyyy-MM-dd");
  const end_date = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd");
  const url = `${OURA_RING_HOST}/usercollection/session?start_date=${start_date}&end_date=${end_date}`;

  const params: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: "get",
    contentType: "application/json",
    headers: { Authorization: `Bearer ${props.OURA_RING_TOKEN}` },
  };

  const contents = UrlFetchApp.fetch(url, params).getContentText();
  const response = JSON.parse(contents) as SessionResponse;
  return response;
}

function calcSessionTime(sessions: Session[]): number {
  if (sessions.length === 0) {
    return 0;
  }

  return sessions
    .map((session) => {
      const diff = new Date(session.end_datetime).getTime() - new Date(session.start_datetime).getTime();
      const minute = diff / 1000 / 60;
      return Math.round(minute);
    })
    .reduce((sum, element) => {
      return sum + element;
    }, 0);
}

function canPost(registeredDay: string): boolean {
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    return true;
  }

  const data = sheet.getRange(lastRow, 1, lastRow + 1, 2).getValues()[0][0];
  const latestDay = Utilities.formatDate(data, "JST", "yyyy-MM-dd");
  return latestDay !== registeredDay;
}

function getTomorrow(): Date {
  var tomorrow = new Date();
  tomorrow.setDate(new Date().getDate() + 1);
  return tomorrow;
}

function getYesterday(): Date {
  var date = new Date();
  date.setDate(new Date().getDate() - 1);
  return date;
}

function getIconNo(data: DailyReadiness): number {
  if (data.score >= 85) {
    return 1;
  } else if (data.score >= 75) {
    return 2;
  } else if (data.score >= 65) {
    return 3;
  } else if (data.score >= 55) {
    return 4;
  } else {
    return 5;
  }
}

function postToSlack(text: string) {
  const payload = {
    text: text,
    blocks: [],
    attachments: [],
  };
  const params: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
  };

  UrlFetchApp.fetch(props.SLACK_WEBHOOK_URL, params);
}

function updateSlackStatus(emoji: string, text: string) {
  const url = "https://slack.com/api/users.profile.set";
  const payload = {
    profile: {
      status_emoji: emoji,
      status_text: text,
    },
  };

  const params: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: `Bearer ${props.SLACK_USER_OAUTH_TOKEN}` },
    payload: JSON.stringify(payload),
  };

  UrlFetchApp.fetch(url, params);
}
