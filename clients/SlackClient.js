const { WebClient } = require("@slack/web-api");

class SlackClient {
    constructor(apiKey) {
        this.slack = new WebClient(apiKey);
    }

    async getUsers() {
        const res = await this.slack.users.list();
        return res.members;
    }

    async postMessage(channelId, message) {
        await this.slack.chat.postMessage({
            channel: channelId,
            text: message,
        });
    }
}

module.exports = {
    SlackClient,
}
