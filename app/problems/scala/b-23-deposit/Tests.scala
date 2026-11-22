@main def tests(): Unit =
  Judge.check("입금")(deposit(Account("kim", 100, true), 50), Account("kim", 150, true))
  Judge.check("비활성 계좌는 그대로 비활성")(deposit(Account("lee", 0, false), 10), Account("lee", 10, false))
  Judge.check("0원 입금")(deposit(Account("park", 5, true), 0), Account("park", 5, true))
  Judge.check("음수 금액")(deposit(Account("choi", 20, true), -30), Account("choi", -10, true))
  val orig = Account("kim", 1, true)
  deposit(orig, 5)
  Judge.check("원본은 바뀌지 않음")(orig, Account("kim", 1, true))
