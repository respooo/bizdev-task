const Dotenv = require('dotenv');
const { NotionClient } = require('./clients/NotionClient');
const { SlackClient } = require('./clients/SlackClient');

Dotenv.config();

const notionClient = new NotionClient(process.env.NOTION_AUTH_KEY);
const slackClient = new SlackClient(process.env.SLACK_API_TOKEN);

const main = async () => {
    const allTasks = await notionClient.getAllTasks(process.env.NOTION_DATABASE_ID);

    const previousRunTimestamp = getPreviousRunTimestamp();
    const newlyCreatedTasks = allTasks.filter((task) => task.created_time > previousRunTimestamp && !isDoneOrStoppingTask(task));

    const noEndDateTasks = allTasks.filter((task) => !task.properties['期日'].date && !isDoneOrStoppingTask(task));

    // 本日締め切りのタスク、締め切りが過ぎているタスクは期日が存在するタスクのみ扱う
    const hasEndDateTasks = allTasks.filter((task) => task.properties['期日'].date?.end)
    
    // 2000-01-01の形で本日の日付のkeyを取得
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;

    // 期日が本日でステータスが完了でないタスク
    const todayTasks = hasEndDateTasks.filter((task) => task.properties['期日'].date.end.includes(todayKey) && !isDoneOrStoppingTask(task));

    // 期日が本日以前でステータスが完了でないタスク
    const expiredTasks = hasEndDateTasks.filter((task) => {
        const expire = task.properties['期日'].date.end;
        if (!expire) return false;
        const splitted = expire.split('-');
        const expireDate = new Date(splitted[0], Number(splitted[1]) - 1, splitted[2]);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        return expireDate < today && !isDoneOrStoppingTask(task);
    });

    const slackMembers = await slackClient.getUsers();

    const todayTasksMessages = await Promise.all(todayTasks.map((todayTask) => convertTaskToSlackText(todayTask, slackMembers)));
    const expiredTasksMessages = await Promise.all(expiredTasks.map((expiredTask) => convertTaskToSlackText(expiredTask, slackMembers)));
    const newlyCreatedTaskMessages = await Promise.all(newlyCreatedTasks.map((newlyCreatedTask) => convertTaskToSlackText(newlyCreatedTask, slackMembers)));
    const noEndDateTaskMessages = await Promise.all(noEndDateTasks.map((noEndDateTask) => convertTaskToSlackText(noEndDateTask, slackMembers)));

    // Send message to slack
    await slackClient.postMessage(
        '#biz-all',
        `📍今日締め切りのタスク\n` +
        (todayTasks.length > 0 ? todayTasksMessages.join('\n') : 'ありません！お疲れ様でした！🎉') + '\n\n' +
        `🚨期限がすぎているタスク\n` +
        (expiredTasks.length > 0 ? expiredTasksMessages.join('\n') : 'ありません！お疲れ様でした！🎉') + 
        (newlyCreatedTasks.length > 0 ? `\n\n🆕新たに追加されたタスク\n${newlyCreatedTaskMessages.join('\n')}` : '') +
        (noEndDateTasks.length > 0 ? `\n\n❓期限が設定されていないタスク\n${noEndDateTaskMessages.join('\n')}` : ''),
    );
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

main();
