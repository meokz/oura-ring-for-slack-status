type DailyReadinessData = {
  day: string;
  score: number;
};

type DailyReadiness = {
  data: DailyReadinessData[];
};

const props = PropertiesService.getScriptProperties().getProperties();

const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

function main() {
  const dailyReadiness = getDailyReadiness();
  const data = dailyReadiness.data.at(-1);
  if (data === undefined) {
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    return update(data);
  }

  const latest = sheet.getRange(lastRow, 1, lastRow + 1, 2).getValues()[0];
  const day = Utilities.formatDate(latest[0], "JST", "yyyy-MM-dd");
  if (day !== data.day || latest[1] !== data.score) {
    return update(data);
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

function update(data: DailyReadinessData) {
  const iconNo = getIconNo(data);
  const emoji = `:condition_${iconNo}:`;
  postToSlack(`${emoji} ${data.score}点`);
  updateSlackStatus(`${emoji}`, `${data.score}点`);

  const setValues = [[data.day, data.score]];
  const lastRow = sheet.getDataRange().getLastRow();
  sheet.getRange(lastRow + 1, 1, 1, setValues.length + 1).setValues(setValues);
}

function getDailyReadiness(): DailyReadiness {
  const host = "https://api.ouraring.com/v2";
  const start_date = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd");
  const end_date = Utilities.formatDate(getTomorrow(), "Asia/Tokyo", "yyyy-MM-dd");
  const url = host + `/usercollection/daily_readiness?start_date=${start_date}&end_date=${end_date}`;

  const params: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: "get",
    contentType: "application/json",
    headers: { Authorization: `Bearer ${props.OURA_RING_TOKEN}` },
  };

  const contents = UrlFetchApp.fetch(url, params).getContentText();
  const dailyReadiness = JSON.parse(contents) as DailyReadiness;
  return dailyReadiness;
}

function getTomorrow(): Date {
  var tomorrow = new Date();
  tomorrow.setDate(new Date().getDate() + 1);
  return tomorrow;
}

function getIconNo(data: DailyReadinessData): number {
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
