// список фильтров
var FILTER_URLS = [
  "https://easylist.to/easylist/easylist.txt",
  "https://easylist.to/easylist/easyprivacy.txt",
  "https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/BaseFilter/sections/adservers.txt"
];

var STORAGE_KEY = "lastUpdate";

// скачиваем фильтр
async function fetchFilter(url) {
  var resp = await fetch(url);
  if (!resp.ok) throw new Error("не скачалось " + url);
  return await resp.text();
}

// парсим EasyList в правила declarativeNetRequest
function parseEasyList(text) {
  var lines = text.split('\n');
  var rules = [];
  var id = 1;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.startsWith('!') || line.trim() === '') continue;
    if (line.includes('##') || line.includes('#@#')) continue; // косметику пропускаем

    var urlFilter = '';
    if (line.startsWith('||')) {
      urlFilter = line.replace('||', '').replace('^', '');
      urlFilter = '||' + urlFilter + '^';
    } else if (line.startsWith('|')) {
      urlFilter = line.replace('|', '');
    } else if (line.startsWith('/') && line.endsWith('/')) {
      continue; // регулярки не умеем
    } else {
      urlFilter = line;
    }

    if (urlFilter.length < 3) continue;

    rules.push({
      id: id++,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: urlFilter,
        resourceTypes: ["main_frame", "sub_frame", "script", "image", "xmlhttprequest", "media", "font", "websocket", "other"]
      }
    });

    if (id > 30000) break; // лимит хрома
  }
  return rules;
}

// обновляем правила
async function updateRules() {
  try {
    var allRules = [];
    for (var j = 0; j < FILTER_URLS.length; j++) {
      var text = await fetchFilter(FILTER_URLS[j]);
      var parsed = parseEasyList(text);
      allRules = allRules.concat(parsed);
      if (allRules.length >= 30000) break;
    }

    allRules = allRules.slice(0, 30000);

    var currentRules = await chrome.declarativeNetRequest.getDynamicRules();
    var oldIds = currentRules.map(function(r) { return r.id; });

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: oldIds,
      addRules: allRules
    });

    await chrome.storage.local.set({ [STORAGE_KEY]: Date.now() });
    console.log("обновил правил: " + allRules.length);
  } catch (e) {
    console.error("ошибка обновления:", e);
  }
}

// при установке и старте
chrome.runtime.onInstalled.addListener(function() {
  updateRules();
  chrome.alarms.create("updateRules", { periodInMinutes: 24 * 60 });
});

chrome.runtime.onStartup.addListener(function() {
  updateRules();
});

chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name === "updateRules") {
    updateRules();
  }
});