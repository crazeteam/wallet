import BigNumber from 'bignumber.js'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Image,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native'
import { getNumberFormatSettings } from 'react-native-localize'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { hideAlert, showToast } from 'src/alert/actions'
import { AssetsEvents, FiatExchangeEvents, HomeEvents } from 'src/analytics/Events'
import ValoraAnalytics from 'src/analytics/ValoraAnalytics'
import { toggleHideBalances } from 'src/app/actions'
import { hideHomeBalancesSelector, hideWalletBalancesSelector } from 'src/app/selectors'
import Dialog from 'src/components/Dialog'
import { formatValueToDisplay } from 'src/components/TokenDisplay'
import Touchable from 'src/components/Touchable'
import { useShowOrHideAnimation } from 'src/components/useShowOrHideAnimation'
import { refreshAllBalances } from 'src/home/actions'
import EyeIcon from 'src/icons/EyeIcon'
import HiddenEyeIcon from 'src/icons/HiddenEyeIcon'
import InfoIcon from 'src/icons/InfoIcon'
import ProgressArrow from 'src/icons/ProgressArrow'
import { useDollarsToLocalAmount } from 'src/localCurrency/hooks'
import {
  getLocalCurrencySymbol,
  localCurrencyExchangeRateErrorSelector,
} from 'src/localCurrency/selectors'
import { navigate, navigateClearingStack } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { totalPositionsBalanceUsdSelector } from 'src/positions/selectors'
import { useDispatch, useSelector } from 'src/redux/hooks'
import { getFeatureGate } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'
import Colors from 'src/styles/colors'
import fontStyles, { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import variables from 'src/styles/variables'
import {
  useTokenPricesAreStale,
  useTokensInfoUnavailable,
  useTokensWithTokenBalance,
  useTokensWithUsdValue,
  useTotalTokenBalance,
} from 'src/tokens/hooks'
import { tokenFetchErrorSelector, tokenFetchLoadingSelector } from 'src/tokens/selectors'
import { getSupportedNetworkIdsForTokenBalances } from 'src/tokens/utils'

function TokenBalance({
  style = styles.balance,
  singleTokenViewEnabled = true,
  showBalanceToggle = false,
}: {
  style?: StyleProp<TextStyle>
  singleTokenViewEnabled?: boolean
  showBalanceToggle?: boolean
}) {
  const supportedNetworkIds = getSupportedNetworkIdsForTokenBalances()
  const tokensWithUsdValue = useTokensWithUsdValue(supportedNetworkIds)
  const localCurrencySymbol = useSelector(getLocalCurrencySymbol)
  const totalTokenBalanceLocal = useTotalTokenBalance()
  const tokenFetchLoading = useSelector(tokenFetchLoadingSelector)
  const tokenFetchError = useSelector(tokenFetchErrorSelector)
  const tokensAreStale = useTokenPricesAreStale(supportedNetworkIds)
  // TODO(ACT-1095): Update these to filter out unsupported networks once positions support non-Celo chains
  const totalPositionsBalanceUsd = useSelector(totalPositionsBalanceUsdSelector)
  const totalPositionsBalanceLocal = useDollarsToLocalAmount(totalPositionsBalanceUsd)
  const totalBalanceLocal =
    totalTokenBalanceLocal || totalPositionsBalanceLocal
      ? new BigNumber(totalTokenBalanceLocal ?? 0).plus(totalPositionsBalanceLocal ?? 0)
      : undefined
  const { decimalSeparator } = getNumberFormatSettings()

  const hideHomeBalanceState = useSelector(hideHomeBalancesSelector)
  const hideWalletBalance = useSelector(hideWalletBalancesSelector)
  const hideBalance = showBalanceToggle && (hideHomeBalanceState || hideWalletBalance)
  const balanceDisplay = hideBalance ? `XX${decimalSeparator}XX` : totalBalanceLocal?.toFormat(2)

  const TotalTokenBalance = ({ balanceDisplay }: { balanceDisplay: string }) => {
    return (
      <View style={styles.row}>
        <Text style={style} testID={'TotalTokenBalance'}>
          {!hideBalance && localCurrencySymbol}
          {balanceDisplay}
        </Text>
        {showBalanceToggle && <HideBalanceButton hideBalance={hideBalance} />}
      </View>
    )
  }

  if (tokenFetchError || tokenFetchLoading || tokensAreStale) {
    // Show '-' if we haven't fetched the tokens yet or prices are stale
    return <TotalTokenBalance balanceDisplay={'-'} />
  } else if (
    singleTokenViewEnabled &&
    tokensWithUsdValue.length === 1 &&
    !totalPositionsBalanceLocal?.isGreaterThan(0)
  ) {
    const tokenBalance = tokensWithUsdValue[0].balance
    return (
      <View style={styles.oneBalance}>
        <Image source={{ uri: tokensWithUsdValue[0].imageUrl }} style={styles.tokenImg} />
        <View style={styles.column}>
          <TotalTokenBalance balanceDisplay={balanceDisplay ?? '-'} />
          {!hideBalance && (
            <Text style={styles.tokenBalance}>
              {formatValueToDisplay(tokenBalance)} {tokensWithUsdValue[0].symbol}
            </Text>
          )}
        </View>
      </View>
    )
  } else {
    return <TotalTokenBalance balanceDisplay={balanceDisplay ?? new BigNumber(0).toFormat(2)} />
  }
}

function HideBalanceButton({ hideBalance }: { hideBalance: boolean }) {
  const dispatch = useDispatch()
  const eyeIconOnPress = () => {
    ValoraAnalytics.track(hideBalance ? HomeEvents.show_balances : HomeEvents.hide_balances)
    dispatch(toggleHideBalances())
  }
  return (
    <Touchable onPress={eyeIconOnPress} hitSlop={variables.iconHitslop}>
      {hideBalance ? <HiddenEyeIcon /> : <EyeIcon />}
    </Touchable>
  )
}

function useErrorMessageWithRefresh() {
  const { t } = useTranslation()

  const supportedNetworkIds = getSupportedNetworkIdsForTokenBalances()
  const tokensInfoUnavailable = useTokensInfoUnavailable(supportedNetworkIds)
  const tokenFetchError = useSelector(tokenFetchErrorSelector)
  const localCurrencyError = useSelector(localCurrencyExchangeRateErrorSelector)

  const dispatch = useDispatch()

  const shouldShowError = tokensInfoUnavailable && (tokenFetchError || localCurrencyError)

  useEffect(() => {
    if (shouldShowError) {
      dispatch(
        showToast(
          t('outOfSyncBanner.message'),
          t('outOfSyncBanner.button'),
          refreshAllBalances(),
          t('outOfSyncBanner.title')
        )
      )
    } else {
      dispatch(hideAlert())
    }
  }, [shouldShowError])
}

export function AssetsTokenBalance({
  showInfo,
  isWalletTab,
}: {
  showInfo: boolean
  // temporary parameter while we build the tab navigator, should be cleaned up
  // when we remove the DrawerNavigator
  isWalletTab: boolean
}) {
  const { t } = useTranslation()

  const [infoVisible, setInfoVisible] = useState(false)
  const [shouldRenderInfoComponent, setShouldRenderInfoComponent] = useState(false)
  const infoOpacity = useSharedValue(0)

  useShowOrHideAnimation(
    infoOpacity,
    infoVisible,
    () => {
      setShouldRenderInfoComponent(true)
    },
    () => {
      setShouldRenderInfoComponent(false)
    }
  )

  const animatedStyles = useAnimatedStyle(() => {
    return {
      opacity: infoOpacity.value,
    }
  })

  const toggleInfoVisible = () => {
    if (!infoVisible) {
      ValoraAnalytics.track(AssetsEvents.show_asset_balance_info)
    }
    setInfoVisible((prev) => !prev)
  }

  const handleDismissInfo = () => {
    setInfoVisible(false)
  }

  return (
    <TouchableWithoutFeedback onPress={handleDismissInfo}>
      <View testID="AssetsTokenBalance">
        <View style={styles.row}>
          {isWalletTab ? (
            <Text style={styles.walletTabTitle}>{t('bottomTabsNavigator.wallet.title')}</Text>
          ) : (
            <Text style={styles.totalAssets}>{t('totalAssets')}</Text>
          )}
          {showInfo && (
            <TouchableOpacity
              onPress={toggleInfoVisible}
              hitSlop={variables.iconHitslop}
              testID="AssetsTokenBalance/Info"
            >
              <InfoIcon color={Colors.primary} />
            </TouchableOpacity>
          )}
        </View>
        <TokenBalance
          style={styles.totalBalance}
          singleTokenViewEnabled={false}
          showBalanceToggle={isWalletTab}
        />

        {shouldRenderInfoComponent && (
          <Animated.View style={[styles.totalAssetsInfoContainer, animatedStyles]}>
            <Text style={styles.totalAssetsInfoText}>{t('totalAssetsInfo')}</Text>
          </Animated.View>
        )}
      </View>
    </TouchableWithoutFeedback>
  )
}

export function HomeTokenBalance() {
  const { t } = useTranslation()

  const totalBalance = useTotalTokenBalance()
  const tokenBalances = useTokensWithTokenBalance()

  useErrorMessageWithRefresh()

  const onViewBalances = () => {
    ValoraAnalytics.track(HomeEvents.view_token_balances, {
      totalBalance: totalBalance?.toString(),
    })
    navigate(Screens.Assets)
  }

  const onCloseDialog = () => {
    setInfoVisible(false)
  }

  const [infoVisible, setInfoVisible] = useState(false)

  return (
    <View style={styles.container} testID="HomeTokenBalance">
      <View style={styles.title}>
        <View style={styles.row}>
          <Text style={styles.totalValue}>{t('totalValue')}</Text>
          {tokenBalances.length > 0 && (
            <TouchableOpacity onPress={() => setInfoVisible(true)} hitSlop={variables.iconHitslop}>
              <InfoIcon size={14} color={Colors.gray3} />
            </TouchableOpacity>
          )}
        </View>
        <Dialog
          title={t('whatTotalValue.title')}
          isVisible={infoVisible}
          actionText={t('whatTotalValue.dismiss')}
          actionPress={onCloseDialog}
          isActionHighlighted={false}
          onBackgroundPress={onCloseDialog}
        >
          {t('whatTotalValue.body')}
        </Dialog>
        <TouchableOpacity style={styles.row} onPress={onViewBalances} testID="ViewBalances">
          <Text style={styles.viewBalances}>{t('viewBalances')}</Text>
          <ProgressArrow style={styles.arrow} color={Colors.primary} />
        </TouchableOpacity>
      </View>
      <TokenBalance style={styles.totalBalance} showBalanceToggle={true} />
    </View>
  )
}

export function FiatExchangeTokenBalance() {
  const { t } = useTranslation()
  const totalBalance = useTotalTokenBalance()
  const tokenBalances = useTokensWithTokenBalance()

  const onViewBalances = () => {
    ValoraAnalytics.track(FiatExchangeEvents.cico_landing_token_balance, {
      totalBalance: totalBalance?.toString(),
    })
    getFeatureGate(StatsigFeatureGates.USE_TAB_NAVIGATOR)
      ? // this can ideally navigate to TabWallet, but if the gate is turned on mid
        // session, a screen named TabWallet won't be found
        navigateClearingStack(Screens.TabNavigator, { initialScreen: Screens.TabWallet })
      : navigate(Screens.Assets)
  }

  return (
    <View style={styles.container} testID="FiatExchangeTokenBalance">
      <View style={styles.titleExchange}>
        <View style={styles.row}>
          {tokenBalances.length > 1 ? (
            <TouchableOpacity style={styles.row} onPress={onViewBalances} testID="ViewBalances">
              <Text style={styles.exchangeTotalValue}>{t('totalValue')}</Text>
              <ProgressArrow style={styles.exchangeArrow} height={9.62} color={Colors.gray4} />
            </TouchableOpacity>
          ) : (
            <Text style={styles.exchangeTotalValue}>{t('totalValue')}</Text>
          )}
        </View>
      </View>
      <TokenBalance style={styles.exchangeBalance} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    margin: variables.contentPadding,
  },
  totalAssets: {
    ...typeScale.labelMedium,
    color: Colors.gray5,
    marginRight: 4,
  },
  walletTabTitle: {
    ...typeScale.titleMedium,
    color: Colors.black,
    marginRight: 10,
  },
  totalAssetsInfoContainer: {
    position: 'absolute',
    top: 32,
    width: 190,
    paddingVertical: Spacing.Smallest8,
    paddingHorizontal: Spacing.Regular16,
    backgroundColor: Colors.black,
    borderRadius: 8,
  },
  totalAssetsInfoText: {
    ...fontStyles.small,
    color: Colors.white,
    textAlign: 'center',
  },
  title: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 7,
  },
  titleExchange: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  totalValue: {
    ...fontStyles.sectionHeader,
    color: Colors.gray4,
    paddingRight: 5,
  },
  exchangeTotalValue: {
    ...fontStyles.label,
    color: Colors.gray4,
    paddingRight: 3,
  },
  viewBalances: {
    ...fontStyles.label,
    color: Colors.primary,
    paddingRight: 8,
  },
  arrow: {
    paddingTop: 3,
  },
  exchangeArrow: {
    paddingTop: 4,
  },
  balance: {
    ...fontStyles.largeNumber,
  },
  totalBalance: {
    ...typeScale.titleLarge,
    color: Colors.black,
  },
  exchangeBalance: {
    ...fontStyles.large500,
  },
  oneBalance: {
    flexDirection: 'row',
  },
  tokenImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 8,
  },
  column: {
    flexDirection: 'column',
  },
  tokenBalance: {
    ...fontStyles.label,
    color: Colors.gray4,
  },
})
