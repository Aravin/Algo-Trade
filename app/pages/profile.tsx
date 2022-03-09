import React from 'react';
import { useUser } from '@auth0/nextjs-auth0';
import { withPageAuthRequired } from '@auth0/nextjs-auth0';

export default function Profile() {
  const { user, error, isLoading } = useUser();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>{error.message}</div>;

  return (
    user && (
      <div>
        <img src={user.picture as string} alt={user.name as string} />
        <h2>{user.name}</h2>
        <p>{user.email}</p>
      </div>
    )
  );
}

export const getServerSideProps = withPageAuthRequired();
