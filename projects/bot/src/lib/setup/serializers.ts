import { SerializerStore } from '#lib/database';
import { container } from '@wolfstar/http-framework';

// Registered before the client registers the path of the pieces, so that the store loads `src/serializers`:
container.stores.register(new SerializerStore());
