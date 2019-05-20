/**
 * @license
 * Copyright (c) 2019 THREEANGLE SOFTWARE SOLUTIONS SRL
 * Available under MIT license webApi/LICENSE
 */

import { inject, injectable } from 'inversify';
import { UpdateOptions } from 'sequelize';
import { IConfigurationService, OAuthConfiguration } from '../../../common/configuration';
import { encrypt, verify } from '../../../common/crypto';
import { ActivateAccountParameters, IEmailService } from '../../../common/email';
import { IJsonConverterService } from '../../../common/json-converter';
import { Logger, LogLevel } from '../../../common/logger';
import { isNil } from '../../../common/utils';
import { DatabaseModel, IDatabaseContext, User } from '../../../data';
import { Credentials, IAccountService } from './account.service.interface';
import { IJwtTokenService } from './jwt-token.service.interface';

@injectable()
export class AccountService implements IAccountService {
  constructor(
    @inject(IDatabaseContext) private dbContext: IDatabaseContext,
    @inject(IJsonConverterService) private jsonConverter: IJsonConverterService,
    @inject(IConfigurationService) private configuration: IConfigurationService,
    @inject(IEmailService) private emailService: IEmailService,
    @inject(IJwtTokenService) private tokenService: IJwtTokenService,
  ) {
  }

  private get oauthConfig(): OAuthConfiguration {
    return this.configuration.getOAuthConfig();
  }

  public async verify(credentials: Credentials): Promise<User> {
    const userObject = await this.dbContext.getModel(DatabaseModel.Users).findOne({
      where: {
        username: credentials.username,
      },
    });
    if (isNil(userObject)) {
      throw new Error('Invalid username or password');
    }
    const user: User = this.jsonConverter.deserialize(userObject, User);
    const valid = verify(credentials.password, user.password);
    if (!valid) {
      throw new Error('Invalid username or password');
    }
    return user;
  }

  public async find(userId: number): Promise<User> {
    const userObject = await this.dbContext.getModel(DatabaseModel.Users).findOne({
      where: {
        id: userId,
      },
    });
    if (isNil(userObject)) {
      throw new Error('Account not found');
    }
    return this.jsonConverter.deserialize(userObject, User);
  }

  public async findByField(field: string, value: any): Promise<User> {
    const userObject = await this.dbContext.getModel(DatabaseModel.Users).findOne({
      where: {
        [field]: value,
      },
    });
    if (isNil(userObject)) {
      return null;
    }
    return this.jsonConverter.deserialize(userObject, User);
  }

  public async activate(token: string): Promise<void> {
    const jwtToken = await this.tokenService.verify(token, this.oauthConfig.accessTokenSecret);
    if (isNil(jwtToken.userId)) {
      throw new Error('Token doesn\'t have the user ID set');
    }
    Logger.getInstance().log(LogLevel.Debug, `Decoded token ${jwtToken.userId}`);
    const userPartial: Partial<User> = {
      active: true,
    };
    const updateOptions: UpdateOptions = {
      where: {
        id: jwtToken.userId,
      },
      returning: true,
    };
    const result = await this.dbContext.getModel(DatabaseModel.Users).update(userPartial, updateOptions);
    const affectedRows: User[] = result[1];
    if (isNil(affectedRows)) {
      throw new Error(`User not found (ID = ${jwtToken.userId})`);
    }
  }

  public async generateActivationToken(user: User): Promise<string> {
    return this.tokenService.generate({
      userId: user.id,
      clientId: this.oauthConfig.clients[0].id,
      clientSecret: this.oauthConfig.accessTokenSecret,
      expirySeconds: this.oauthConfig.clients[0].accessTokenExpirySeconds,
      grants: this.oauthConfig.clients[0].grants,
    });
  }

  public async create(newUserPartial: Partial<User>, createdBy: number): Promise<void> {
    if (isNil(newUserPartial)) {
      throw new Error('No user data provided');
    }
    const userExists = await this.userExists(newUserPartial);
    if (userExists) {
      throw new Error('An user account with the same username or email already exists');
    }
    this.prepareUserPartialForCreate(newUserPartial, createdBy);
    const createdUser = await this.dbContext.getModel(DatabaseModel.Users).create(newUserPartial);
    if (isNil(createdUser)) {
      throw new Error('Account not created');
    }
    await this.sendAccountActivationEmail(createdUser);
  }

  public async update(userPartial: Partial<User>, updatedBy: number): Promise<void> {
    if (isNil(userPartial)) {
      throw new Error('No user changes provided');
    }
    this.prepareUserPartialForUpdate(userPartial, updatedBy);

    const updateOptions: UpdateOptions = {
      where: {
        id: userPartial.id,
      },
      returning: true,
    };
    const updatedUser = await this.dbContext.getModel(DatabaseModel.Users).update(userPartial, updateOptions);
    if (isNil(updatedUser)) {
      throw new Error('Failed to updated user');
    }
  }

  private prepareUserPartialForCreate(newUserPartial: Partial<User>, createdBy: number): void {
    const currentDate: Date = new Date();
    newUserPartial.createdAt = currentDate;
    newUserPartial.updatedAt = currentDate;

    newUserPartial.createdBy = createdBy;
    newUserPartial.updatedBy = createdBy;

    newUserPartial.active = false;
    newUserPartial.password = encrypt(newUserPartial.password);
  }

  private prepareUserPartialForUpdate(userPartial: Partial<User>, updatedBy: number): void {
    const currentDate: Date = new Date();
    userPartial.updatedAt = currentDate;

    userPartial.updatedBy = updatedBy;

    if (userPartial.password) {
      userPartial.password = encrypt(userPartial.password);
    }
  }

  private async userExists(user: Partial<User>): Promise<boolean> {
    const userWithSameUsername = await this.findByField('username', user.username);
    if (!isNil(userWithSameUsername)) {
      return true;
    }
    const userWithSameEmail = await this.findByField('email', user.email);
    if (!isNil(userWithSameEmail)) {
      return true;
    }
    console.log('Returning false');
    return false;
  }

  private async sendAccountActivationEmail(user: User): Promise<void> {
    if (isNil(user)) {
      throw new Error('Empty user data');
    }
    const toAddress: string = user.email;
    const fromAddress: string = this.configuration.getEmailConfig().from;

    const accessToken: string = await this.generateActivationToken(user);
    const encodedAccessToken: string = encodeURIComponent(accessToken);
    const activationLink: string = `${this.configuration.getClientBaseUrl()}/account/activate?token=${encodedAccessToken}`;

    const templateParameters: ActivateAccountParameters = {
      name: user.firstName,
      activationLink: activationLink,
    };

    return this.emailService.sendAccountActivationEmail(toAddress, fromAddress, templateParameters);
  }
}
