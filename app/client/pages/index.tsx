import Head from "next/head";
import { useUser } from "@auth0/nextjs-auth0";
import { withPageAuthRequired } from "@auth0/nextjs-auth0";

export default function Home() {
  const { user, error, isLoading } = useUser();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>{error.message}</div>;

  return (
    user && (
      <div>
        <Head>
          <title>Algo Trade</title>
          <link rel="icon" href="/favicon.ico" />
        </Head>

        {/* Start of main  */}
        <div className="flex justify-between bg-green-500 py-4 px-2">
          <div className="flex-2">
            <span className="text-white text-lg font-bold">
              📈 Algo Trading
            </span>
          </div>
          <div className="flex-2 hidden md:visible">
            <img src={user.picture as string} alt={user.name as string} className="rounded-md inline-flex" width="30" />
            {' '}
            <span className="text-white font-bold">{user.name}</span>
          </div>

          <div className="flex-2 visible md:hidden">
            Menu
          </div>
        </div>
        {/* End of main  */}

        {/* End of div */}
      </div>
    )
  );
}

export const getServerSideProps = withPageAuthRequired();
