import { UserProfile, Setup, TradeRecord } from '../types';

// Default Admin Credentials
export const DEFAULT_ADMIN: UserProfile = {
  uid: 'admin-001',
  email: 'admin@roxo.ia',
  displayName: 'Marvyn (Dono do Sistema)',
  role: 'admin',
  createdAt: new Date().toISOString(),
};

export const DEFAULT_USERS: UserProfile[] = [
  DEFAULT_ADMIN,
  {
    uid: 'user-002',
    email: 'trader.pro@gmail.com',
    displayName: 'Trader Pro',
    role: 'trader',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    uid: 'user-003',
    email: 'lucas.forex@hotmail.com',
    displayName: 'Lucas Forex',
    role: 'trader',
    createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
  },
];

class AuthService {
  private currentUser: UserProfile | null = null;
  private users: UserProfile[] = [];
  private listeners: ((user: UserProfile | null) => void)[] = [];

  constructor() {
    this.init();
  }

  private init() {
    try {
      const storedUsers = localStorage.getItem('roxoia_users');
      if (storedUsers) {
        this.users = JSON.parse(storedUsers);
      } else {
        this.users = [...DEFAULT_USERS];
        localStorage.setItem('roxoia_users', JSON.stringify(this.users));
      }

      const activeSession = localStorage.getItem('roxoia_session');
      if (activeSession) {
        this.currentUser = JSON.parse(activeSession);
      } else {
        // Log in as owner/admin by default for seamless instant access
        this.currentUser = DEFAULT_ADMIN;
        localStorage.setItem('roxoia_session', JSON.stringify(this.currentUser));
      }
    } catch {
      this.currentUser = DEFAULT_ADMIN;
      this.users = [...DEFAULT_USERS];
    }
  }

  public getCurrentUser(): UserProfile | null {
    return this.currentUser;
  }

  public onAuthStateChanged(callback: (user: UserProfile | null) => void) {
    this.listeners.push(callback);
    callback(this.currentUser);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l(this.currentUser));
  }

  public async login(email: string, password: string): Promise<UserProfile> {
    // Default admin shortcut
    if (email.toLowerCase() === 'admin@roxo.ia' && password === 'admin123456') {
      this.currentUser = DEFAULT_ADMIN;
      localStorage.setItem('roxoia_session', JSON.stringify(this.currentUser));
      this.notify();
      return this.currentUser;
    }

    const found = this.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (found) {
      this.currentUser = found;
      localStorage.setItem('roxoia_session', JSON.stringify(this.currentUser));
      this.notify();
      return this.currentUser;
    }

    // If not found, authenticate as new member
    const newUser: UserProfile = {
      uid: 'user-' + Math.random().toString(36).slice(2, 9),
      email,
      displayName: email.split('@')[0],
      role: 'trader',
      createdAt: new Date().toISOString(),
    };
    this.users.push(newUser);
    localStorage.setItem('roxoia_users', JSON.stringify(this.users));
    this.currentUser = newUser;
    localStorage.setItem('roxoia_session', JSON.stringify(this.currentUser));
    this.notify();
    return newUser;
  }

  public logout(): void {
    this.currentUser = null;
    localStorage.removeItem('roxoia_session');
    this.notify();
  }

  public getAllUsers(): UserProfile[] {
    return [...this.users];
  }

  public deleteUser(uid: string): void {
    if (uid === DEFAULT_ADMIN.uid) return;
    this.users = this.users.filter((u) => u.uid !== uid);
    localStorage.setItem('roxoia_users', JSON.stringify(this.users));
  }
}

export const authService = new AuthService();

// -------------------------------------------------------------
// Cloud & Local Sync for Setups and Trades
// -------------------------------------------------------------
export const cloudStorage = {
  saveSetups(setups: Setup[]) {
    try {
      localStorage.setItem('roxoia_cloud_setups', JSON.stringify(setups));
      return true;
    } catch {
      return false;
    }
  },

  getSetups(): Setup[] | null {
    try {
      const data = localStorage.getItem('roxoia_cloud_setups');
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  saveTrades(trades: TradeRecord[]) {
    try {
      localStorage.setItem('roxoia_trades', JSON.stringify(trades));
    } catch {}
  },

  getTrades(): TradeRecord[] {
    try {
      const data = localStorage.getItem('roxoia_trades');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },
};
