import { defineFunction } from '@aws-amplify/backend';

export const preSignUp = defineFunction({
  name: 'geofield-confirm-signup',
  entry: './handler.ts',
  resourceGroupName: 'auth',
});
