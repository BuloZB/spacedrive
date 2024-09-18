import { useNavigation } from '@react-navigation/native';
import { MotiView } from 'moti';
import { AppleLogo, GithubLogo, GoogleLogo, IconProps } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { LinearTransition } from 'react-native-reanimated';
import { getAuthorisationURLWithQueryParamsAndSetState } from 'supertokens-web-js/recipe/thirdparty';
import Card from '~/components/layout/Card';
import ScreenContainer from '~/components/layout/ScreenContainer';
import { Button } from '~/components/primitive/Button';
import { toast } from '~/components/primitive/Toast';
import { tw, twStyle } from '~/lib/tailwind';
import { SettingsStackScreenProps } from '~/navigation/tabs/SettingsStack';

import Login from './Login';
import Register from './Register';

const AccountTabs = ['Login', 'Register'] as const;

type SocialLogin = {
	name: 'Github' | 'Google' | 'Apple';
	icon: React.FC<IconProps>;
};

const SocialLogins: SocialLogin[] = [
	{ name: 'Github', icon: GithubLogo },
	{ name: 'Google', icon: GoogleLogo },
	{ name: 'Apple', icon: AppleLogo }
];

const AccountLogin = () => {
	const [activeTab, setActiveTab] = useState<'Login' | 'Register'>('Login');

	// FIXME: Currently opens in App.
	// const socialLoginHandlers = (name: SocialLogin['name']) => {
	// 	return {
	// 		Github: async () => {
	// 			try {
	// 				const authUrl = await getAuthorisationURLWithQueryParamsAndSetState({
	// 					thirdPartyId: 'github',

	// 					// This is where Github should redirect the user back after login or error.
	// 					frontendRedirectURI: 'http://localhost:9420/api/auth/callback/github'
	// 				});

	// 				// we redirect the user to Github for auth.
	// 				window.location.assign(authUrl);
	// 			} catch (err: any) {
	// 				if (err.isSuperTokensGeneralError === true) {
	// 					// this may be a custom error message sent from the API by you.
	// 					toast.error(err.message);
	// 				} else {
	// 					toast.error('Oops! Something went wrong.');
	// 				}
	// 			}
	// 		},
	// 		Google: async () => {
	// 			try {
	// 				const authUrl = await getAuthorisationURLWithQueryParamsAndSetState({
	// 					thirdPartyId: 'google',

	// 					// This is where Google should redirect the user back after login or error.
	// 					// This URL goes on the Google's dashboard as well.
	// 					frontendRedirectURI: 'http://localhost:9420/api/auth/callback/google'
	// 				});

	// 				/*
	// 				Example value of authUrl: https://accounts.google.com/o/oauth2/v2/auth/oauthchooseaccount?scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email&access_type=offline&include_granted_scopes=true&response_type=code&client_id=1060725074195-kmeum4crr01uirfl2op9kd5acmi9jutn.apps.googleusercontent.com&state=5a489996a28cafc83ddff&redirect_uri=https%3A%2F%2Fsupertokens.io%2Fdev%2Foauth%2Fredirect-to-app&flowName=GeneralOAuthFlow
	// 				*/

	// 				// we redirect the user to google for auth.
	// 				window.location.assign(authUrl);
	// 			} catch (err: any) {
	// 				if (err.isSuperTokensGeneralError === true) {
	// 					// this may be a custom error message sent from the API by you.
	// 					toast.error(err.message);
	// 				} else {
	// 					toast.error('Oops! Something went wrong.');
	// 				}
	// 			}
	// 		},
	// 		Apple: async () => {
	// 			try {
	// 				const authUrl = await getAuthorisationURLWithQueryParamsAndSetState({
	// 					thirdPartyId: 'apple',

	// 					// This is where Apple should redirect the user back after login or error.
	// 					frontendRedirectURI: 'http://localhost:9420/api/auth/callback/apple'
	// 				});

	// 				// we redirect the user to Apple for auth.
	// 				window.location.assign(authUrl);
	// 			} catch (err: any) {
	// 				if (err.isSuperTokensGeneralError === true) {
	// 					// this may be a custom error message sent from the API by you.
	// 					toast.error(err.message);
	// 				} else {
	// 					toast.error('Oops! Something went wrong.');
	// 				}
	// 			}
	// 		}
	// 	}[name]();
	// };

	return (
		<ScreenContainer scrollview={false} style={tw`gap-2 px-6`}>
			<View style={tw`flex flex-col justify-between gap-5 lg:flex-row`}>
				<Card style={tw`relative flex w-full flex-col items-center justify-center !p-0`}>
					<View style={tw`flex w-full flex-row gap-x-2`}>
						{AccountTabs.map((text) => (
							<Button
								key={text}
								onPress={() => {
									setActiveTab(text);
								}}
								style={twStyle(
									'relative flex-1 border-b border-app-line p-2.5 text-center',
									text === 'Login' ? 'rounded-tl-md' : 'rounded-tr-md'
								)}
							>
								<Text
									style={twStyle(
										'relative z-10 text-sm transition-colors duration-200',
										text === activeTab
											? 'font-medium text-ink'
											: 'text-ink-faint'
									)}
								>
									{text}
								</Text>
								{text === activeTab && (
									<MotiView
										animate={{
											borderRadius: text === 'Login' ? 0.3 : 0
										}}
										layout={LinearTransition.duration(200)}
										style={tw`absolute inset-x-0 top-0 z-0 size-full bg-app-line/60`}
									/>
								)}
							</Button>
						))}
					</View>
					<View style={tw`flex w-full flex-col justify-center gap-1.5 p-5`}>
						{activeTab === 'Login' ? <Login /> : <Register />}
						{/* Disabled for now */}
						{/* <View style={tw`my-2 flex w-full items-center gap-3`}>
							<Divider />
							<Text style={tw`text-xs text-ink-faint`}>OR</Text>
							<Divider />
						</View>
						<View style={tw`flex justify-center gap-3`}>
							{SocialLogins.map((social) => (
								<Button
									variant="outline"
									onPress={async () => await socialLoginHandlers(social.name)}
									key={social.name}
									style={tw`rounded-full border border-app-line bg-app-input p-3`}
								>
									<social.icon style={tw`text-white`} weight="bold" />
								</Button>
							))}
						</View> */}
					</View>
				</Card>
			</View>
		</ScreenContainer>
	);
};
export default AccountLogin;
