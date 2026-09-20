import { overlay } from "overlay-kit"

import { AccountDialog } from "@/components/account-dialog"
import { KeywordBidLogDialog } from "@/components/keyword-bid-log-dialog"

/**
 * 계정 연결 다이얼로그를 연다. 로그인 성공 시 true, 취소 시 false로 resolve.
 */
export function openAccountDialog() {
  return overlay.openAsync<boolean>(({ isOpen, close, unmount }) => (
    <AccountDialog isOpen={isOpen} close={close} unmount={unmount} />
  ))
}

/** 키워드 입찰 기록(그래프·표) 다이얼로그를 연다 */
export function openKeywordBidLogDialog(keyword: {
  adGroupId: string
  id: string
  keyword: string
}) {
  overlay.open(({ isOpen, close, unmount }) => (
    <KeywordBidLogDialog
      isOpen={isOpen}
      close={close}
      unmount={unmount}
      adGroupId={keyword.adGroupId}
      keywordId={keyword.id}
      keyword={keyword.keyword}
    />
  ))
}
