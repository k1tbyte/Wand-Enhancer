export class Store {
    getUserAccount(userId) {
        return Promise.resolve({ id: userId, pro: false });
    }
    setAccountWandBrandExperience(exp) {
        const uri = "/v3/account/brand_experience_wand";
        return Promise.resolve(exp);
    }
    setAccountLanguage(lang) {
        return Promise.resolve(lang);
    }
}

const ACTION_SET_ACCOUNT_CONST = "ACTION_SET_ACCOUNT";
export function accountReducer(state, action) {
    const myAccount = action.payload;
    return { ...state, account: myAccount };
}

export function requestRemoteAuthCode() {
    return fetch('/api/remote/auth');
}

export function registerUpdate() {
    registerHandler("ACTION_CHECK_FOR_UPDATE", () => {
        checkForUpdates();
    });
}

export function startApp() {
    myApp.whenReady().then(() => {
        console.log("App ready");
    });
    myApp.whenReady().then(run);
}

export class RemoteClient {
    #trainerId;
    #instanceId;
    #currentTrainer;
    #gameId;
    #socket;
    
    constructor() {
        this.#instanceId = Date.now().toString();
    }

    sendState() {
        const s = this.#socket;
        s.listen("client-state", () => this.#syncState());
        s.listen("client-value-changed", (e) => this.#onRemoteValue(e));
    }

    #resetClient() {
        this.#trainerId = null;
        this.#instanceId = Date.now().toString();
    }

    #syncState() {
        if (this.status === 1) {
            this.#socket?.send("client-state", {
                instanceId: this.#instanceId,
                trainerId: this.#trainerId,
                trainerLoading: this.#currentTrainer?.isLoading(),
                gameVersion: this.#currentTrainer?.getMetadata(l.vO)?.gameVersion
            });
        }
    }

    #onRemoteValue(e) {
        if (this.#currentTrainer && e?.instanceId === this.#instanceId) {
            this.#currentTrainer.isActive() ? this.#currentTrainer.setValue(e.name, e.value, 3, e.cheatId) : this.#syncState();
        }
    }

    setCurrentTrainer(evt, trainerObj = null) {
        const s = evt?.trainerId || null;
        if (s === this.#trainerId && trainerObj === this.#currentTrainer) return;
        this.#resetClient();
        this.#trainerId = s;
        if (!s) return;
        this.#currentTrainer = trainerObj;
        
        const subs = [];
        if (trainerObj.isActive()) {
            this.#bindTrainer(trainerObj, subs);
        }
    }

    #bindTrainer(trainerObj, subs) {
        subs.push(
            trainerObj.onValueSet((valEvt) => {
                if (this.status === 1 && 3 !== valEvt.source) {
                    this.#socket?.send("client-value-changed", {
                        instanceId: this.#instanceId,
                        name: valEvt.name,
                        value: valEvt.value,
                        cheatId: valEvt.cheatId
                    });
                }
            })
        );
        this.#syncState();
    }
}
