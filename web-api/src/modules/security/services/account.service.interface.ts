/**
 * @license
 * Copyright (c) 2018 THREEANGLE SOFTWARE SOLUTIONS SRL
 * Available under MIT license webApi/LICENSE
 */

import { User } from '../../../data';

export interface Credentials {
  username: string;
  password: string;
}

/**
 * Handles action related to users' accounts.
 */
export interface IAccountService {
  /**
   * Verifies credentials and returns the user if found.
   * @param credentials User's credentials.
   */
  verify(credentials: Credentials): Promise<User>;

  /**
   * Looks for a user based on it's id and returns it if found.
   * @param userId User's id.
   */
  find(userId: number): Promise<User>;

  /**
   * Activates an user's account based on the provided token.
   * @param token Activation token.
   */
  activate(token: string): Promise<void>;

  /**
   * Generates an access token for a user
   * @param user The user object
   */
  generateAccessToken(user: User): Promise<string>;
}
export const IAccountService = Symbol.for('IAccountService');
