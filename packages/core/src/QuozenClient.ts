import { IStorageLayer } from "./infrastructure/IStorageLayer";
import { GroupRepository } from "./infrastructure/GroupRepository";
import { LedgerRepository } from "./infrastructure/LedgerRepository";
import { LedgerService } from "./finance/LedgerService";
import { User } from "./domain/models";

export interface QuozenConfig {
    storage: IStorageLayer;
    user: User;
}

export class QuozenClient {
    public groups: GroupRepository;

    constructor(private config: QuozenConfig) {
        this.groups = new GroupRepository(config.storage, config.user);
    }

    public ledger(groupId: string): LedgerService {
        const repo = new LedgerRepository(this.config.storage, groupId);
        return new LedgerService(repo, this.config.user);
    }
}
