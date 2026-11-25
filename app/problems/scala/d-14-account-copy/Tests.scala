import Event.*

def show(a: Account): (String, Int, Boolean) = (a.owner, a.balance, a.frozen)

@main def tests(): Unit =
  val a = Account("kim", 100, false)
  Judge.check("copy 한 필드")(show(a.copy(balance = 70)), ("kim", 70, false))
  Judge.check("copy 인자 없음")(show(a.copy()), ("kim", 100, false))
  Judge.check("copy 두 필드")(show(a.copy(owner = "lee", frozen = true)), ("lee", 100, true))
  Judge.check("원본 불변")({ a.copy(balance = 0); show(a) }, ("kim", 100, false))
  Judge.check("입금 출금")(show(applyAll(a, List(Deposit(50), Withdraw(30)))), ("kim", 120, false))
  Judge.check("잔액 초과 출금 무시")(show(applyAll(a, List(Withdraw(500), Deposit(1)))), ("kim", 101, false))
  Judge.check("동결 후 무시")(show(applyAll(a, List(Deposit(10), Freeze, Deposit(999), Withdraw(5)))), ("kim", 110, true))
  Judge.check("이벤트 없음")(show(applyAll(a, Nil)), ("kim", 100, false))
