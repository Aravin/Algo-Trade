export class Account {
    private static instance: Account;

    private constructor() {
        // TODO:
    }

    public accountId!: string;
    public token!: string;

    public static getInstance(): Account {
        if (!Account.instance) {
            Account.instance = new Account();
        }

        return Account.instance;
    }
    
}
