def describe(m: Money): String = m match
  case Money(0, _) => "빈 돈"
  case Money(n, "KRW") => s"${n}원"
  case Money(n, c) => s"$n $c"

@main def tests(): Unit =
  Judge.check("new 없이 생성")(Money(5, "KRW").amount, 5)
  Judge.check("패턴 매칭")(List(Money(0, "USD"), Money(1500, "KRW"), Money(3, "USD")).map(describe), List("빈 돈", "1500원", "3 USD"))
  Judge.check("copy 한 필드")(Money(5, "KRW").copy(amount = 9), Money(9, "KRW"))
  Judge.check("copy 인자 없음")(Money(5, "KRW").copy(), Money(5, "KRW"))
  Judge.check("== 와 Set")(Set(Money(1, "KRW"), Money(1, "KRW"), Money(1, "USD")).size, 2)
  Judge.check("toString")(Money(5, "KRW").toString, "Money(5,KRW)")
