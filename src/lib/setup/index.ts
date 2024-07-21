// Config must be the first to be loaded, as it sets the env:
import '#root/config';
import 'reflect-metadata';

// Import everything else:
import '#lib/setup/paginated-message';
import '#lib/setup/inspect';
import '#utils/Sanitizer/initClean';
import '@sapphire/plugin-api/register';
import '@sapphire/plugin-editable-commands/register';
import '@sapphire/plugin-i18next/register';
import '@sapphire/plugin-logger/register';

import { ApplicationCommandRegistries, RegisterBehavior } from '@sapphire/framework';
import * as colorette from 'colorette';

colorette.createColors({ useColor: true });
ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(RegisterBehavior.Overwrite);
