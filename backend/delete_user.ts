import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const emailToDelete = 'ysnongh3412@mineo.jp';

async function main() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    await client.connect();

    try {
        console.log(`Attempting to delete user with email: ${emailToDelete}`);

        // Find the user first
        const { rows } = await client.query('SELECT id FROM auth.users WHERE email = $1', [emailToDelete]);

        if (rows.length === 0) {
            console.log('User not found.');
            return;
        }

        const userId = rows[0].id;
        console.log(`Found user with ID: ${userId}. Deleting...`);

        // Because of Supabase's foreign key constraints with ON DELETE CASCADE,
        // deleting from auth.users will automatically clean up auth.identities, 
        // public.profiles, public.vehicles, etc.
        const deleteRes = await client.query('DELETE FROM auth.users WHERE id = $1', [userId]);

        if ((deleteRes.rowCount ?? 0) > 0) {
            console.log('✅ Successfully deleted user from auth.users (and cascaded profile/vehicles).');
        } else {
            console.log('Failed to delete user.');
        }

    } catch (error) {
        console.error('Error executing query:', error);
    } finally {
        await client.end();
    }
}

main();
