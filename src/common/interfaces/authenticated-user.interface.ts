import { UserRole } from '../enums/user-role.enum';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}
