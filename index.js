const Dotenv = require('dotenv');
const { NotionClient } = require('./clients/NotionClient');
const { SlackClient } = require('./clients/SlackClient');

Dotenv.config();

const notionClient = new NotionClient(process.env.NOTION_AUTH_KEY);
const slackClient = new SlackClient(process.env.SLACK_API_TOKEN);

const main = async () => {
    // Get today limit tasks from notion
    const allTasks = await notionClient.getAllTasks(process.env.NOTION_DATABASE_ID);
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
    const todayTasks = allTasks.filter((result) => result.properties['ๆ้'].date?.start === todayKey);
    const expiredTasks = allTasks.filter((result) => {
        const expire = result.properties['ๆ้'].date?.start;
        if (!expire) return false;
        const splitted = expire.split('-');
        const expireDate = new Date(splitted[0], Number(splitted[1]) - 1, splitted[2]);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const isDone = result.properties['Status'].multi_select.filter((select) => select.name.includes('Done')).length !== 0;
        return expireDate < today && !isDone;
    });

    const slackMembers = await slackClient.getUsers();

    const todayTasksMessages = await Promise.all(todayTasks.map((todayTask) => convertTaskToSlackText(todayTask, slackMembers)));
    const expiredTasksMessages = await Promise.all(expiredTasks.map((expiredTask) => convertTaskToSlackText(expiredTask, slackMembers)));

    // Send message to slack
    await slackClient.postMessage(
        '#biz-all',
        `๐ไปๆฅ็ท ใๅใใฎใฟในใฏใใใใพใ๏ผ\n` +
        todayTasksMessages.join('\n') + '\n\n' +
        `๐จโใฎใฟในใฏใฏๆ้ใ้ใใฆใใพใ๏ผ\n` +
        expiredTasksMessages.join('\n')
    );
}

const convertTaskToSlackText = async (task, slackMembers) => {
    const taskMembers = task.properties['Member'].relation;
    const taskMemberEmails = await Promise.all(taskMembers.map(async (taskMember) => {
        const page = await notionClient.getPage(taskMember.id);
        return page.properties['email'].email
    }));
    const slackMemberIds = taskMemberEmails.map((taskMemberEmail) => {
        const slackMember = slackMembers.find((member) => member.profile.email === taskMemberEmail);
        if (!slackMember) return null;
        return slackMember.id;
    }).filter((v) => v !== null);
    return `<${task.url}|${task.properties['ๅๅ'].title[0]?.plain_text ?? "ใฟในใฏ"}> ` +
        slackMemberIds.map((slackMemberId) => `<@${slackMemberId}>`).join(' , ');
}

main();
