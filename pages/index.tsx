import Head from "next/head"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { useConnection, useWallet } from "@solana/wallet-adapter-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  CandyMachine,
  Metaplex,
  Nft,
  NftWithToken,
  PublicKey,
  Sft,
  SftWithToken,
  walletAdapterIdentity,
} from "@metaplex-foundation/js"
import { Keypair, Transaction } from "@solana/web3.js"
import confetti from "canvas-confetti"

import {
  getRemainingAccountsForCandyGuard,
  mintV2Instruction,
} from "@/utils/mintV2"
import { fromTxError } from "@/utils/errors"
import Countdown from "react-countdown"

export default function Home() {
  const wallet = useWallet()
  const { publicKey } = wallet
  const { connection } = useConnection()
  const [metaplex, setMetaplex] = useState<Metaplex | null>(null)
  const [candyMachine, setCandyMachine] = useState<CandyMachine | null>(null)
  const [collection, setCollection] = useState<
    Sft | SftWithToken | Nft | NftWithToken | null
  >(null)
  const [formMessage, setFormMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [fetchInterval, setFetchInterval] = useState<NodeJS.Timeout | null>()
  const [mintQuantity, setMintQuantity] = useState(1)

  const fetchCandyMachine = useCallback(
    async (metaplex: Metaplex) => {
      if (metaplex) {
        if (!process.env.NEXT_PUBLIC_CANDY_MACHINE_ID) {
          throw new Error("Please provide a candy machine id")
        }

        const candyMachine = await metaplex.candyMachines().findByAddress({
          address: new PublicKey(process.env.NEXT_PUBLIC_CANDY_MACHINE_ID),
        })

        setCandyMachine(candyMachine)

        return candyMachine
      }
    },
    [metaplex]
  )

useEffect(() => {
  ;(async () => {
      if (connection && !collection && !candyMachine) {
        if (!process.env.NEXT_PUBLIC_CANDY_MACHINE_ID) {
          throw new Error("Please provide a candy machine id")
        }

        const metaplex = new Metaplex(connection)

        setMetaplex(metaplex)

        const candyMachine = await fetchCandyMachine(metaplex)

        if (!candyMachine) throw new Error("Couldn't find the Candy Machine")

        const collection = await metaplex
          .nfts()
          .findByMint({ mintAddress: candyMachine.collectionMintAddress })

        setCollection(collection)

        if (!fetchInterval) {
          const interval = setInterval(() => {
            // Fetch the candy machine every 2 seconds
            fetchCandyMachine(metaplex)
          }, 2000)

          setFetchInterval(interval)
        }
      }
    })()

    return () => {
      if (fetchInterval) {
        clearInterval(fetchInterval)
      }
    }
  }, [connection])

  /** Mints NFTs through a Candy Machine using Candy Guards */
  const handleMintV2 = async () => {
    if (!metaplex || !candyMachine || !publicKey || !candyMachine.candyGuard) {
      if (!candyMachine?.candyGuard)
        throw new Error(
          "This app only works with Candy Guards. Please setup your Guards through Sugar."
        )

      throw new Error(
        "Couldn't find the Candy Machine or the connection is not defined."
      )
    }

    try {
      setIsLoading(true)

      const { remainingAccounts, additionalIxs } =
        getRemainingAccountsForCandyGuard(candyMachine, publicKey)

      const txs: Transaction[] = []

      for (let i = 0; i < mintQuantity; i++) {
        const mint = Keypair.generate()
        const { instructions } = await mintV2Instruction(
          candyMachine.candyGuard?.address,
          candyMachine.address,
          publicKey,
          publicKey,
          mint,
          connection,
          metaplex,
          remainingAccounts
        )

        const tx = new Transaction()

        if (additionalIxs?.length) {
          tx.add(...additionalIxs)
        }

        tx.add(...instructions)

        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
        tx.feePayer = wallet.publicKey!
        tx.sign(mint)

        txs.push(tx)
      }

      if (!wallet.signAllTransactions) {
        throw new Error("Wallet doesn't support signAllTransactions")
      }

      const signedTxs = await wallet.signAllTransactions(txs)

      const promises = signedTxs.map(async (tx) => {
        const txid = await connection.sendRawTransaction(tx.serialize())

        return txid
      })

      const txids = await Promise.all(promises)

      txids.forEach(async (txid) => {
        await connection.confirmTransaction(txid)
      })

      setFormMessage("Minted successfully!")
      confetti()
    } catch (e: any) {
      const msg = fromTxError(e)

      if (msg) {
        setFormMessage(msg.message)
      } else {
        const msg = e.message || e.toString()
        setFormMessage(msg)
      }
    } finally {
      setIsLoading(false)

      setTimeout(() => {
        setFormMessage(null)
      }, 5000)
    }
  }

  const cost = candyMachine
    ? candyMachine.candyGuard?.guards.solPayment
      ? Number(candyMachine.candyGuard?.guards.solPayment?.amount.basisPoints) /
        1e9
      : 0
    : 0

  // percentage between minted and available
  const percentage = candyMachine
    ? candyMachine.itemsAvailable
      ? Math.floor(
          (candyMachine.itemsMinted.toNumber() /
            candyMachine.itemsAvailable.toNumber()) *
            100
        )
      : 0
    : 0

  const goLiveDate = useMemo(() => {
    return candyMachine?.candyGuard?.guards.startDate?.date
      ? new Date(
          candyMachine?.candyGuard?.guards.startDate?.date.toNumber() * 1000
        )
      : null
  }, [candyMachine])

  const isMintLive = useMemo(() => {
    if (!goLiveDate) return false

    return new Date().getTime() - goLiveDate?.getTime() > 0
  }, [goLiveDate])

  return (
    <>
      <Head>
        <title>Soul Again Mint Page</title>
        <meta charSet="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <meta name="description" content="Soul Again Mint Page by CEC"/>
        <meta property="og:title" content="Soul Again Mint Page"/>
        <meta property="og:description" content="Soul Again Mint Page"/>
        <meta property="og:type" content="website"/>
        <meta property="og:url" content="https://soulagain.crypto-elites.club"/>
        <link rel="icon" type="image/png" href="https://soulagain.crypto-elites.club/assets/images/fav.png" />
      </Head>
      {candyMachine && collection ? (
        <main
            className="main-container"
        >
          <div
            className="header"
          >
            <div className="h-cont">
              <div className="left-sect">
                <a href="https://soulagain.crypto-elites.club/">
                  <img className="logo" src="https://soulagain.crypto-elites.club/assets/images/logoC.svg"/>
                </a>
                <a href="https://runonflux.io/fluxlabs.html">
                  <img className="logo-flux" src="https://soulagain.crypto-elites.club/assets/images/icon/flux_labs.svg"/>
                </a>
              </div>
              <a href="https://soulagain.crypto-elites.club/" className="Navhome">
                Home
              </a>
            </div>
          </div>          
          <div
            className="cm-window"
          >
            <h1 className="title">Soul Again</h1>
            <div className="social-container">
              <a href="https://discord.gg/cryptoelitesclub">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  fill="none"
                  stroke="#fafafa"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  className="icon icon-tabler icon-tabler-brand-discord-filled"
                  viewBox="0 0 24 24"
                >
                  <path stroke="none" d="M0 0h24v24H0z"></path>
                  <path
                    fill="currentColor"
                    strokeWidth="0"
                    d="M14.983 3l.123.006c2.014.214 3.527.672 4.966 1.673a1 1 0 01.371.488c1.876 5.315 2.373 9.987 1.451 12.28C20.891 19.452 19.288 21 17.5 21c-.94 0-2.257-1.596-2.777-2.969l-.02.005c.838-.131 1.69-.323 2.572-.574a1 1 0 10-.55-1.924c-3.32.95-6.13.95-9.45 0a1 1 0 00-.55 1.924c.725.207 1.431.373 2.126.499l.444.074C8.818 19.405 7.6 21 6.668 21c-1.743 0-3.276-1.555-4.267-3.644-.841-2.206-.369-6.868 1.414-12.174a1 1 0 01.358-.49C5.565 3.676 6.98 3.217 8.89 3.007a1 1 0 01.938.435l.063.107.652 1.288.16-.019c.877-.09 1.718-.09 2.595 0l.158.019.65-1.287a1 1 0 01.754-.54l.123-.01zM9 9a2 2 0 00-1.977 1.697l-.018.154L7 11l.005.15A2 2 0 109 9zm6 0a2 2 0 00-1.977 1.697l-.018.154L13 11l.005.15A2 2 0 1015 9z"
                  ></path>
                </svg>
              </a>

              <a href="https://www.facebook.com/cryptoelitesclub">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  fill="none"
                  stroke="#fafafa"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  className="icon icon-tabler icon-tabler-brand-facebook-filled"
                  viewBox="0 0 26 26"
                >
                  <path stroke="none" d="M0 0h24v24H0z"></path>
                  <path
                    fill="currentColor"
                    strokeWidth="0"
                    d="M15.26,25.05c5.64-.81,9.87-5.62,9.87-11.48,0-6.42-5.21-11.63-11.63-11.63S1.87,7.15,1.87,13.57c0,5.83,4.14,10.62,9.74,11.47h-.01c0-2.71,.01-5.39,.01-8.1h-2.99c0-1.13,.02-2.25,.03-3.38h2.97c0-.48-.16-3.02,.33-4.53,.76-2.31,3.37-3.01,6.65-2.31,0,.95,.02,1.9,.03,2.86-2.83,.08-3.6-.18-3.35,4.07,1.05,0,2.19-.05,3.24-.05-.16,1.13-.33,2.26-.49,3.39l-2.76,.04c.01,2.68,.03,5.36,.04,8.04"
                  ></path>
                </svg>
              </a>
                          
              <a href="#">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  fill="none"
                  stroke="#fafafa"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  className="icon icon-tabler icon-tabler-brand-magic-eden-filled"
                  viewBox="0 0 24 24"
                >
                  <path stroke="none" d="M0 0h24v24H0z"></path>
                  <path
                    fill="currentColor"
                    strokeWidth="0"
                    d="m8.96,15.02c.11-.22.19-.36.24-.5.82-2.02,1.64-4.03,2.46-6.05.44-1.09.96-1.44,2.13-1.45,3.3,0,6.59,0,9.89,0,.82,0,1.41.51,1.48,1.25.07.84-.54,1.5-1.43,1.51-1.72.01-3.44,0-5.16,0-.14,0-.28,0-.42,0l-.04.11c.24.21.49.42.73.63.63.54,1.29,1.06,1.9,1.64.69.66.76,1.65.2,2.42-.13.18-.3.33-.46.47-.72.61-1.45,1.22-2.18,1.82-.06.05-.14.09-.21.14.02.04.03.07.05.11.15.01.3.03.45.03,1.65,0,3.3-.02,4.94.02.37,0,.79.12,1.1.31.5.3.66.93.5,1.47-.18.58-.69.98-1.32,1-.58.02-1.16,0-1.73,0-2.05,0-4.11.01-6.16,0-1.65-.01-2.83-1.55-2.32-3.08.14-.42.44-.83.76-1.14.7-.67,1.47-1.27,2.2-1.91.35-.3.36-.35.02-.65-.91-.79-1.83-1.57-2.74-2.36-.22-.19-.33-.17-.44.12-1,2.62-2,5.24-3.01,7.85-.41,1.07-1.5,1.42-2.3.74-.21-.18-.38-.45-.49-.72-.83-2.08-1.63-4.17-2.44-6.25-.06-.14-.12-.28-.18-.43-.03,0-.06.01-.1.02,0,.14,0,.28,0,.42,0,1.96.01,3.91,0,5.87,0,1.08-1.08,1.81-2.07,1.4-.6-.24-.96-.7-.96-1.36,0-3.11-.01-6.22,0-9.33,0-.95.76-1.8,1.74-2.05.99-.25,2.04.19,2.55,1.11.21.38.36.81.53,1.21.7,1.72,1.4,3.44,2.1,5.16.05.12.11.23.21.44Z"
                  ></path>
                </svg>
              </a>

              <a href="#">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  fill="none"
                  stroke="#fafafa"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  className="icon icon-tabler icon-tabler-brand-opensea-filled"
                  viewBox="0 0 24 24"
                >
                  <path stroke="none" d="M0 0h24v24H0z"></path>
                   <path
                    fill="currentColor"
                    strokeWidth="0"
                    d="M1.6,13.7l0.1-0.1l5.6-8.8c0.1-0.1,0.3-0.1,0.3,0C8.6,6.9,9.4,9.5,9,11.1c-0.2,0.7-0.6,1.6-1.1,2.4
                    c-0.1,0.1-0.1,0.2-0.2,0.4C7.7,14,7.6,14,7.5,14H1.8C1.6,14,1.5,13.8,1.6,13.7z"
                  ></path>
                  <path stroke="none" d="M0 0h24v24H0z"></path>
                  <path
                    fill="currentColor"
                    strokeWidth="0"
                    d="M26.7,15.3v1.4c0,0.1,0,0.2-0.1,0.2c-0.4,0.2-1.9,0.9-2.5,1.7c-1.6,2.2-2.8,5.4-5.5,5.4H7.2c-4,0-7.2-3.2-7.2-7.3v-0.1c0-0.1,0.1-0.2,0.2-0.2h6.3c0.1,0,0.2,0.1,0.2,0.2c0,0.4,0,0.8,0.2,1.2c0.4,0.8,1.1,1.2,2,1.2H12v-2.4H8.9c-0.2,0-0.3-0.2-0.2-0.3c0-0.1,0.1-0.1,0.1-0.2c0.3-0.4,0.7-1.1,1.1-1.8c0.3-0.5,0.6-1,0.8-1.5c0-0.1,0.1-0.2,0.1-0.3c0.1-0.2,0.1-0.3,0.2-0.5c0-0.1,0.1-0.3,0.1-0.4c0.1-0.4,0.1-0.9,0.1-1.4c0-0.2,0-0.4,0-0.6c0-0.2,0-0.4-0.1-0.6c0-0.2-0.1-0.4-0.1-0.6c0-0.3-0.1-0.6-0.2-0.8l0-0.1c-0.1-0.2-0.1-0.4-0.2-0.6c-0.2-0.6-0.4-1.2-0.6-1.8C10.1,5,10,4.8,9.9,4.6C9.8,4.2,9.7,4,9.5,3.7C9.5,3.6,9.4,3.4,9.4,3.3C9.3,3.2,9.3,3.1,9.2,2.9c0-0.1-0.1-0.2-0.1-0.3L8.7,2c-0.1-0.1,0-0.2,0.1-0.2l2.4,0.6h0c0,0,0,0,0,0l0.3,0.1l0.3,0.1l0.1,0V1.2C12,0.6,12.5,0,13.2,0c0.3,0,0.6,0.1,0.9,0.4c0.2,0.2,0.4,0.5,0.4,0.9v2.1l0.3,0.1c0,0,0,0,0.1,0c0.1,0,0.2,0.1,0.3,0.2c0.1,0.1,0.2,0.2,0.3,0.2c0.2,0.2,0.5,0.4,0.8,0.7c0.1,0.1,0.2,0.1,0.2,0.2c0.4,0.4,0.8,0.8,1.2,1.2c0.1,0.1,0.2,0.3,0.3,0.4c0.1,0.1,0.2,0.3,0.3,0.4c0.1,0.2,0.3,0.4,0.4,0.6c0.1,0.1,0.1,0.2,0.2,0.3c0.2,0.3,0.3,0.5,0.5,0.8c0.1,0.1,0.1,0.3,0.2,0.4c0.2,0.4,0.3,0.7,0.4,1.1c0,0.1,0,0.2,0.1,0.2v0c0,0.1,0,0.2,0,0.3c0,0.4,0,0.7-0.1,1.1c0,0.2-0.1,0.3-0.1,0.5c-0.1,0.2-0.1,0.3-0.2,0.5c-0.1,0.3-0.3,0.6-0.5,0.9c-0.1,0.1-0.1,0.2-0.2,0.3c-0.1,0.1-0.2,0.2-0.2,0.3c-0.1,0.1-0.2,0.3-0.3,0.4c-0.1,0.1-0.2,0.3-0.3,0.4c-0.1,0.2-0.3,0.3-0.4,0.5c-0.1,0.1-0.2,0.2-0.3,0.3c-0.1,0.1-0.2,0.2-0.3,0.3c-0.1,0.1-0.3,0.3-0.4,0.4l-0.2,0.2c0,0-0.1,0-0.1,0h-1.9v2.4h2.4c0.5,0,1-0.2,1.4-0.5c0.1-0.1,0.8-0.7,1.5-1.4c0,0,0.1,0,0.1-0.1l6.6-1.9C26.5,15.1,26.7,15.2,26.7,15.3z"
                  ></path>
                </svg>
              </a>

            
              <a href="https://www.reddit.com/r/cryptoelitesclub/">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  fill="none"
                  stroke="#fafafa"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  className="icon icon-tabler icon-tabler-brand-reddit-filled"
                  viewBox="0 0 26 26"
                >
                  <path stroke="none" d="M0 0h24v24H0z"></path>
                  <path
                    fill="currentColor"
                    strokeWidth="0"
                    d="M26.58,13.6c-.04-1.57-1.31-2.86-2.89-2.91-.86-.03-1.65,.32-2.21,.88-1.86-1.33-4.37-2.21-7.17-2.36-.09,0-.16-.09-.14-.18l1.19-5.79c.02-.08,.1-.13,.18-.12l3.89,.82c.09,.02,.15,.09,.16,.18,.11,1.06,1.01,1.89,2.1,1.88,1.1-.01,2.02-.9,2.06-2,.05-1.19-.91-2.17-2.08-2.17-.78,0-1.47,.43-1.82,1.07-.03,.05-.09,.08-.15,.07l-4.59-.97s-.07-.01-.11-.01c-.27-.02-.52,.16-.57,.43l-1.36,6.59c-.02,.11-.11,.18-.22,.19-2.9,.1-5.5,.97-7.43,2.33-.55-.5-1.28-.79-2.08-.77-1.59,.04-2.88,1.34-2.9,2.92-.02,1.22,.68,2.27,1.71,2.75-.03,.25-.05,.5-.05,.76,0,4.42,5.07,8,11.32,8s11.32-3.58,11.32-8c0-.25-.02-.49-.05-.74,1.13-.44,1.92-1.55,1.89-2.85ZM6.46,15.65c0-1.32,1.07-2.38,2.38-2.38s2.38,1.07,2.38,2.38-1.07,2.38-2.38,2.38-2.38-1.07-2.38-2.38Zm11.5,5.69c-1.37,.96-2.59,1.3-4.39,1.3h0c-1.8,0-3.01-.34-4.38-1.3-.19-.13-.51-.51-.55-.81l.02-.03c.13-.18,.38-.17,.57-.09,1.4,.61,2.74,1.38,4.34,1.39,1.6-.01,2.94-.78,4.33-1.39,.2-.09,.44-.09,.57,.09l.02,.03c-.04,.3-.36,.68-.55,.81Zm.01-3.31c-1.32,0-2.38-1.07-2.38-2.38s1.07-2.38,2.38-2.38,2.38,1.07,2.38,2.38-1.07,2.38-2.38,2.38Z"
                  ></path>
                </svg>
              </a>
                            
              <a href="https://twitter.com/crypto_e_club">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  fill="none"
                  stroke="#fafafa"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  className="icon icon-tabler icon-tabler-brand-twitter-filled"
                  viewBox="0 0 24 24"
                >
                  <path stroke="none" d="M0 0h24v24H0z"></path>
                  <path
                    fill="currentColor"
                    strokeWidth="0"
                    d="M14.058 3.41c-1.807.767-2.995 2.453-3.056 4.38L11 7.972l-.243-.023C8.365 7.68 6.259 6.437 4.813 4.418a1 1 0 00-1.685.092l-.097.186-.049.099c-.719 1.485-1.19 3.29-1.017 5.203l.03.273c.283 2.263 1.5 4.215 3.779 5.679l.173.107-.081.043c-1.315.663-2.518.952-3.827.9-1.056-.04-1.446 1.372-.518 1.878 3.598 1.961 7.461 2.566 10.792 1.6 4.06-1.18 7.152-4.223 8.335-8.433l.127-.495c.238-.993.372-2.006.401-3.024l.003-.332.393-.779.44-.862.214-.434.118-.247c.265-.565.456-1.033.574-1.43l.014-.056.008-.018c.22-.593-.166-1.358-.941-1.358l-.122.007a.997.997 0 00-.231.057l-.086.038a7.46 7.46 0 01-.88.36l-.356.115-.271.08-.772.214c-1.336-1.118-3.144-1.254-5.012-.554l-.211.084z"
                  ></path>
                </svg>
              </a>
            </div>
            <p className="proj-descript">
              {collection?.json?.description}
            </p>

            <div
              className="live-count-sect"
            >
              <p>
                {candyMachine ? (
                  isMintLive ? (
                    "Mint is live!"
                  ) : goLiveDate ? (
                    <Countdown date={goLiveDate?.getTime()} />
                  ) : (
                    "Live date not set"
                  )
                ) : (
                  "Loading..."
                )}
              </p>
            </div>
            <div
              className="low-cm-text"
            >
              <div
                className="pubmint"
              >
                <span>Public Mint</span>
                <b>{cost} SOL</b>
              </div>
              <div
                className="ls-count"
              >
                <span className="font-span" >Live</span>
                <span className="font-span" >
                  {percentage}% ({candyMachine?.itemsMinted?.toString()}/
                  {candyMachine?.itemsAvailable?.toString()})
                </span>
              </div>
              <div
                className="mint-sect"
              >
                <button
                  style={{ flex: 1 }}
                  disabled={!publicKey || isLoading}
                  onClick={handleMintV2}
                >
                  {isLoading
                    ? "Minting your NFT..."
                    : `Mint`}
                </button>
                <input
                  className="a-count"
                  defaultValue={1}
                  value={mintQuantity}
                  onChange={(e) => setMintQuantity(Number(e.target.value))}
                  type="number"
                />
              </div>
              <div 
                className="wmb"
              >
              <WalletMultiButton
                style={{
                  width: "100%",
                  height: "auto",
                  padding: "inherit",
                  borderRadius: "inherit",
                  justifyContent: "center",
                  fontSize: "inherit",
                  color: "#02395d",
                  backgroundColor: "#BA4564",
                  lineHeight: "1.45",
                  fontFamily: "acier-bat-solid",
                  cursor: "pointer",
                  display: "flex",
                }}              
              />
              </div>
              <p>
                {formMessage}
              </p>
            </div>
          </div>
          <div
            className="footer"
          >
            <p>2023 CEC</p>
          </div>          
        </main>
      ) : (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: '#333333',
          zIndex: 9999,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}>
            <img
              src="https://crypto-elites.club/img/logo.png"
              alt="Loader Image"
              style={{
                animation: 'flashing 1s infinite',
              }}
            />
            <div style={{
              width: 0,
              height: '10px',
              backgroundColor: '#01C9FE',
              marginTop: '20px',
              transition: 'width 0.5s ease-in-out',
            }}></div>
          </div>
        </div>
      )}
      <style jsx>{`
         
        @media (min-width: 1440px) and (min-height: 810px) {
          main {
            font-size: 29px;
          }
          .title {
            font-size: 41px;
          }
          .icon-tabler-brand-discord-filled {
            height: 42px;
            width: 42px;
          }
          .icon-tabler-brand-facebook-filled {
            height: 40px;
            width: 40px;
          }
          .icon-tabler-brand-magic-eden-filled {
            height: 58px;
            width: 58px;
          }
          .icon-tabler-brand-opensea-filled {
            height: 40px;
            width: 40px;
          }
          .icon-tabler-brand-reddit-filled {
            height: 42px;
            width: 42px;
          }
          .icon-tabler-brand-twitter-filled {
            height: 40px;
            width: 40px;
          }
          .proj-descript {
            margin: 32px 40px 32px;
          }
          .font-span {
            font-size: 23px;
          }
          .wmb {
            font-size: 20px;
          }
          
        }

        @media (min-width: 1920px) and (min-height: 1080px) {
          main {
            font-size: 36px;
          }
          .header {
            height: 125px;
          }
          .Navhome {
            font-size: 33px;
          }
          .cm-window {
            box-shadow: 0px 0px 17px -1px rgba(0,0,0,0.20);
            border: 1.5px solid rgba(0, 0, 0, 0.1);
            border-radius: 31px;
          }
          .title {
            font-size: 60px;
          }
          .icon-tabler-brand-discord-filled {
            height: 62px;
            width: 62px;
          }
          .icon-tabler-brand-facebook-filled {
            height: 59px;
            width: 59px;
          }
          .icon-tabler-brand-magic-eden-filled {
            height: 86px;
            width: 86px;
          }
          .icon-tabler-brand-opensea-filled {
            height: 62px;
            width: 62px;
          }
          .icon-tabler-brand-reddit-filled {
            height: 62px;
            width: 62px;
          }
          .icon-tabler-brand-twitter-filled {
            height: 62px;
            width: 62px;
          }
          .proj-descript {
            margin: 51px 60px 37px;
          }
          .live-count-sect {
            padding: 1.6rem 4.6rem;
          }
          .low-cm-text {
            padding: 24px 18px;
          }
          .pubmint {
            margin-bottom: 5px;
          }
          .ls-count {
            margin-bottom: 23px;
          }
          .font-span {
            font-size: 34px;
          }
          .mint-sect {
            gap: 6px;
          }
          .a-count {
            width: 57px;
            font-size: 29px;
            border-radius: 16px;
            border: 3px solid #02395d;
          }
          .wmb {
            font-size: 29px;
          }
          .footer {
            height: 125px;
            font-size: 33px;
          }
        }

        @media (min-width: 2560px) and (min-height: 1440px) {
          main {
            font-size: 59px;
          }
          .header {
            height: 197px;
          }
          .Navhome {
            font-size: 47px;
          }
          .cm-window {
            box-shadow: 0px 0px 19px -1px rgba(0,0,0,0.20);
            border: 2px solid rgba(0, 0, 0, 0.1);
            border-radius: 31px;
          }
          .title {
            font-size: 80px;
          }
          .icon-tabler-brand-discord-filled {
            height: 82px;
            width: 82px;
          }
          .icon-tabler-brand-facebook-filled {
            height: 78px;
            width: 78px;
          }
          .icon-tabler-brand-magic-eden-filled {
            height: 114px;
            width: 114px;
          }
          .icon-tabler-brand-opensea-filled {
            height: 78px;
            width: 78px;
          }
          .icon-tabler-brand-reddit-filled {
            height: 82px;
            width: 82px;
          }
          .icon-tabler-brand-twitter-filled {
            height: 78px;
            width: 78px;
          }
          .proj-descript {
            margin: 42px 80px 42px;
          }
          .live-count-sect {
            padding: 1.8rem 6.2rem;
          }
          .low-cm-text {
            padding: 31px 24px;
          }
          .pubmint {
            margin-bottom: 7px;
          }
          .ls-count {
            margin-bottom: 33px;
          }
          .font-span {
            font-size: 45px;
          }
          .mint-sect {
            gap: 8px;
          }
          .a-count {
            width: 76px;
            font-size: 39px;
            border-radius: 16px;
            border: 4px solid #02395d;
          ]
          .wmb {
            font-size: 39px;
            margin-top: 12px;
          }
          .footer {
            height: 197px;
            font-size: 47px;
          }
        }

        @media (min-width: 3840px) and (min-height: 2160px) {
          main {
            font-size: 94px;
          }
          .header {
            height: 298px;
          }
          .Navhome {
            font-size: 70px;
          }
          .cm-window {
            box-shadow: 0px 0px 23px -1px rgba(0,0,0,0.20);
            border: 2px solid rgba(0, 0, 0, 0.1);
            border-radius: 31px;
          }
          .title {
            font-size: 120px;
          }
          .icon-tabler-brand-discord-filled {
            height: 123px;
            width: 123px;
          }
          .icon-tabler-brand-facebook-filled {
            height: 117px;
            width: 117px;
          }
          .icon-tabler-brand-magic-eden-filled {
            height: 170px;
            width: 170px;
          }
          .icon-tabler-brand-opensea-filled {
            height: 117px;
            width: 117px;
          }
          .icon-tabler-brand-reddit-filled {
            height: 123px;
            width: 123px;
          }
          .icon-tabler-brand-twitter-filled {
            height: 117px;
            width: 117px;
          }
          .proj-descript {
            margin: 51px 160px 51px;
          }
          .live-count-sect {
            padding: 2.8rem 9.2rem;
          }
          .low-cm-text {
            padding: 47px 35px;
          }
          .pubmint {
            margin-bottom: 11px;
          }
          .ls-count {
            margin-bottom: 46px;
          }
          .font-span {
            font-size: 67px;
          }
          .mint-sect {
            gap: 16px;
          }
          .a-count {
            width: 114px;
            font-size: 59px;
            border-radius: 16px;
            border: 8px solid #02395d; 
          }
          .wmb {
            font-size: 59px;
            margin-top: 16px;
          }
          .footer {
            height: 298px;
            font-size: 70px;
          }
        }
      `}</style>
    </>
  )
}
