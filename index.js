const Dotenv = require('dotenv');
const { NotionClient } = require('./clients/NotionClient');
const { SlackClient } = require('./clients/SlackClient');

Dotenv.config();

const notionClient = new NotionClient(process.env.NOTION_AUTH_KEY);
const slackClient = new SlackClient(process.env.SLACK_API_TOKEN);

const main = async () => {
    const allTasks = await notionClient.getAllTasks(process.env.NOTION_DATABASE_ID);

    // 期日が存在するタスクのみ扱う
    const hasEndDateTasks = allTasks.filter((task) => task.properties['期日'].date?.end)
    
    // 2000-01-01の形で本日の日付のkeyを取得
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;

    // 期日が本日でステータスが完了でないタスク
    const todayTasks = hasEndDateTasks.filter((task) => task.properties['期日'].date.end.includes(todayKey) && !task.properties['ステータス'].status.name.includes('完了'));

    // 期日が本日以前でステータスが完了でないタスク
    const expiredTasks = hasEndDateTasks.filter((task) => {
        const expire = task.properties['期日'].date.end;
        if (!expire) return false;
        const splitted = expire.split('-');
        const expireDate = new Date(splitted[0], Number(splitted[1]) - 1, splitted[2]);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const isDone = task.properties['ステータス'].status.name.includes('完了');
        return expireDate < today && !isDone;
    });

    const slackMembers = await slackClient.getUsers();

    const todayTasksMessages = await Promise.all(todayTasks.map((todayTask) => convertTaskToSlackText(todayTask, slackMembers)));
    const expiredTasksMessages = await Promise.all(expiredTasks.map((expiredTask) => convertTaskToSlackText(expiredTask, slackMembers)));

    // Send message to slack
    await slackClient.postMessage(
        '#biz-all',
        `📍今日締め切りのタスク: ${todayTasksMessages.length === 0 ? 'ありません！お疲れ様でした！🎉' : `${todayTasksMessages.length}件`}\n` +
        todayTasksMessages.join('\n') + '\n\n' +
        `🚨期限がすぎているタスク: ${expiredTasks.length}件\n` +
        expiredTasksMessages.join('\n')
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
    return `<${task.url}|${task.properties['タスク名'].title[0]?.plain_text ?? "タスク"}> ` +
        slackMemberIds.map((slackMemberId) => `<@${slackMemberId}>`).join(' , ');
}

main();
