const Dotenv = require('dotenv');
const { NotionClient } = require('./clients/NotionClient');
const { SlackClient } = require('./clients/SlackClient');

Dotenv.config();

const notionClient = new NotionClient(process.env.NOTION_AUTH_KEY);
const slackClient = new SlackClient(process.env.SLACK_API_TOKEN);

const main = async () => {
    const allTasks = await notionClient.getAllTasks(process.env.NOTION_DATABASE_ID);
    const previousRunTimestamp = getPreviousRunTimestamp();
    const todayKey = getTodayKey();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const newlyCreatedTasks = filterTasks(allTasks, task =>
        task.created_time > previousRunTimestamp && !isDoneOrStoppingTask(task)
    );

    const noEndDateTasks = filterTasks(allTasks, task =>
        !task.properties['期日'].date && !isDoneOrStoppingTask(task)
    );

    const hasEndDateTasks = filterTasks(allTasks, task =>
        task.properties['期日'].date?.end
    );

    const todayTasks = filterTasks(hasEndDateTasks, task =>
        isDueToday(task, todayKey)
    );

    const expiredTasks = filterTasks(hasEndDateTasks, task =>
        isExpired(task, today)
    );

    const slackMembers = await slackClient.getUsers();

    const [
        todayTasksMessages,
        expiredTasksMessages,
        newlyCreatedTaskMessages,
        noEndDateTaskMessages
    ] = await Promise.all([
        createSlackMessages(todayTasks, slackMembers),
        createSlackMessages(expiredTasks, slackMembers),
        createSlackMessages(newlyCreatedTasks, slackMembers),
        createSlackMessages(noEndDateTasks, slackMembers)
    ]);

    const message = `📍今日締め切りのタスク\n` +
         (todayTasksMessages.length > 0 ? todayTasksMessages.join('\n') : 'ありません！お疲れ様でした！🎉') + '\n\n' +
         `🚨期限がすぎているタスク\n` +
         (expiredTasksMessages.length > 0 ? expiredTasksMessages.join('\n') : 'ありません！お疲れ様でした！🎉') +
         (newlyCreatedTaskMessages.length > 0 ? `\n\n🆕新たに追加されたタスク\n${newlyCreatedTaskMessages.join('\n')}` : '') +
         (noEndDateTaskMessages.length > 0 ? `\n\n❓期限が設定されていないタスク\n${noEndDateTaskMessages.join('\n')}` : '');
    
    await slackClient.postMessage('#biz-all', message);
}

const convertTaskToSlackText = async (task, slackMembers) => {
    const taskMembers = task.properties['担当者'].people;
    const taskMemberEmails = await Promise.all(taskMembers.map(async (taskMember) => {
        const user = await notionClient.getUser(taskMember.id);
        return user.person.email;
    }));
    // notionに登録されているemailからslackメンバーを検索し、IDを取得
    const slackMemberIds = taskMemberEmails.map((taskMemberEmail) => {
        const slackMember = slackMembers.find((member) => member.profile.email === taskMemberEmail);
        if (!slackMember) return null;
        return slackMember.id;
    }).filter((v) => v !== null);
    let parent;
    if (task.properties['親プロジェクト'].relation.length) {
        parent = await notionClient.getPage(task.properties['親プロジェクト'].relation[0]['id']);
    }
    return `<${task.url}|${task.properties['タスク名'].title[0]?.plain_text ?? "タスク"}> ` +
        (parent ? `( <${parent.url}|${parent.properties['プロジェクト名'].title[0]?.plain_text}> ) ` : '') +
        slackMemberIds.map((slackMemberId) => `<@${slackMemberId}>`).join(' , ');
}

const isDoneOrStoppingTask = (task) => {
    return task.properties['ステータス'].status.name.includes('完了') || task.properties['ステータス'].status.name.includes('一時停止');
}

// 前回実行時間を計算
const getPreviousRunTimestamp = () => {
    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
  
    const target = new Date(now); // コピーして調整
    target.setSeconds(0);
    target.setMilliseconds(0);
  
    if (currentHours < 9 || (currentHours === 9 && currentMinutes < 0)) {
      // 9:00前 → 前日は19:30
      target.setDate(target.getDate() - 1);
      target.setHours(19, 30);
    } else if (currentHours < 19 || (currentHours === 19 && currentMinutes < 30)) {
      // 9:00〜19:29 → 当日9:00
      target.setHours(9, 0);
    } else {
      // 19:30以降 → 当日19:30
      target.setHours(19, 30);
    }
  
    return target.toISOString();
  }

// タスクのフィルタリングを共通化
const filterTasks = (tasks, predicate) => tasks.filter(predicate);

// 日付をYYYY-MM-DD形式で取得
const getTodayKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
};

// 期日が本日かどうか判定
const isDueToday = (task, todayKey) =>
    task.properties['期日'].date?.end?.includes(todayKey) && !isDoneOrStoppingTask(task);

// 期日が本日以前かどうか判定
const isExpired = (task, today) => {
    const expire = task.properties['期日'].date?.end;
    if (!expire) return false;
    const [y, m, d] = expire.split('-');
    const expireDate = new Date(y, Number(m) - 1, d);
    return expireDate < today && !isDoneOrStoppingTask(task);
};

// メッセージ生成の共通化
const createSlackMessages = async (tasks, slackMembers) =>
    Promise.all(tasks.map(task => convertTaskToSlackText(task, slackMembers)));

main();
